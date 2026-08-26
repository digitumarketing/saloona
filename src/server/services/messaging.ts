/**
 * Message queue.
 *
 * Messages are queued to the database first and delivered by the scheduled
 * worker, never inline with a user request. That way a Meta outage delays
 * delivery instead of failing a checkout, retries are bounded and visible, and
 * the monthly message allowance can be enforced against a real count.
 *
 * Idempotency is enforced by `dedupe_key`, which has a partial unique index:
 * if a cron run overlaps or is retried, the same reminder cannot be queued twice.
 */

import type { PlatformDb, TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { addDays, nowIso, startOfLocalMonth, toIso } from "../lib/time.js";
import { planLimits } from "../../shared/plans.js";
import { getTemplate, renderTemplate, templateParams } from "./templates.js";
import { WhatsAppClient, type WhatsAppCredentials } from "./whatsapp.js";

/** Delivery attempts before a message is abandoned. */
const MAX_ATTEMPTS = 4;
/** Backoff in minutes per attempt: ~5 min, 25 min, 2 h. */
const BACKOFF_MINUTES = [5, 25, 120];
/** Messages drained per scheduled run, to stay inside the Worker CPU budget. */
const DRAIN_BATCH_SIZE = 40;
/** How long a claimed message stays locked before another run may retry it. */
const LOCK_MINUTES = 10;

export interface QueueMessageInput {
  customerId: string;
  toPhone: string;
  templateKey: string;
  values: Record<string, string | number>;
  /** Unique per logical message, e.g. `reminder:cus_x:2026-08-26`. */
  dedupeKey?: string;
  scheduledFor?: string;
  campaignId?: string;
}

export class MessageQuotaError extends Error {
  constructor(
    readonly used: number,
    readonly allowed: number
  ) {
    super(`Monthly message allowance reached (${used}/${allowed}). Upgrade your plan to send more.`);
    this.name = "MessageQuotaError";
  }
}

export class MessageQueue {
  constructor(
    private readonly db: TenantDb,
    private readonly timezone = "Asia/Karachi"
  ) {}

  /**
   * Queues one message.
   *
   * Returns `queued: false` with a reason instead of throwing for the ordinary
   * skip cases — opted out, no consent, already queued — because callers loop
   * over customers and a skip is a normal outcome, not an error.
   */
  async enqueue(input: QueueMessageInput): Promise<{ queued: boolean; id?: string; reason?: string }> {
    const template = getTemplate(input.templateKey);
    if (!template) return { queued: false, reason: "unknown_template" };

    const customer = await this.db.first<{
      id: string;
      consent_whatsapp: number;
      whatsapp_opt_out_at: string | null;
    }>("select id, consent_whatsapp, whatsapp_opt_out_at from customers where id = ? {where}", [input.customerId]);

    if (!customer) return { queued: false, reason: "customer_not_found" };
    if (customer.whatsapp_opt_out_at) return { queued: false, reason: "opted_out" };
    // Marketing messages require explicit consent; utility messages tied to a
    // transaction the customer initiated do not.
    if (template.category === "MARKETING" && !customer.consent_whatsapp) {
      return { queued: false, reason: "no_consent" };
    }

    const id = newId("message");
    const ts = nowIso();
    try {
      await this.db.insert("message_queue", {
        id,
        customer_id: input.customerId,
        channel: "whatsapp",
        provider: "whatsapp_cloud",
        template_key: input.templateKey,
        body: renderTemplate(template, input.values),
        to_phone: input.toPhone,
        status: "queued",
        dedupe_key: input.dedupeKey ?? null,
        campaign_id: input.campaignId ?? null,
        scheduled_for: input.scheduledFor ?? ts,
        attempts: 0,
        created_at: ts,
        updated_at: ts
      });
      return { queued: true, id };
    } catch (error) {
      // The partial unique index on (organization_id, dedupe_key) rejects the
      // duplicate. That is the desired outcome, not a failure.
      if (input.dedupeKey && String(error).includes("UNIQUE")) {
        return { queued: false, reason: "already_queued" };
      }
      throw error;
    }
  }

  /** Messages sent this calendar month, measured in the tenant's timezone. */
  async usageThisMonth(): Promise<number> {
    const from = toIso(startOfLocalMonth(this.timezone));
    const row = await this.db.first<{ count: number }>(
      "select count(*) as count from message_queue where status = 'sent' and sent_at >= ? {where}",
      [from]
    );
    return row?.count ?? 0;
  }

  /**
   * Checks the plan allowance before a bulk send.
   *
   * Enforced here rather than only shown in the UI: the allowance is what the
   * subscription tiers are priced on, and every message costs the salon money
   * with Meta directly.
   */
  async assertQuota(planId: string, additional: number): Promise<void> {
    const allowed = planLimits(planId).monthlyMessages;
    const used = await this.usageThisMonth();
    if (used + additional > allowed) throw new MessageQuotaError(used, allowed);
  }

  async stats(): Promise<{ queued: number; sent: number; failed: number }> {
    const row = await this.db.first<{ queued: number; sent: number; failed: number }>(
      `select
         sum(case when status = 'queued' then 1 else 0 end) as queued,
         sum(case when status = 'sent' then 1 else 0 end) as sent,
         sum(case when status = 'failed' then 1 else 0 end) as failed
       from message_queue where 1 = 1 {where}`
    );
    return { queued: row?.queued ?? 0, sent: row?.sent ?? 0, failed: row?.failed ?? 0 };
  }

  recent(limit = 50): Promise<
    Array<{
      id: string;
      customer_name: string | null;
      template_key: string;
      body: string;
      status: string;
      attempts: number;
      last_error: string | null;
      scheduled_for: string;
      sent_at: string | null;
    }>
  > {
    return this.db.all(
      `select m.id, c.full_name as customer_name, m.template_key, m.body, m.status, m.attempts,
              m.last_error, m.scheduled_for, m.sent_at
       from message_queue m left join customers c on c.id = m.customer_id
       where 1 = 1 {where:m}
       order by m.created_at desc limit ?`,
      [Math.min(limit, 200)]
    );
  }
}

export interface PendingMessage {
  id: string;
  organization_id: string;
  customer_id: string | null;
  template_key: string;
  body: string;
  to_phone: string | null;
  attempts: number;
  campaign_id: string | null;
  business_name: string;
}

/**
 * Cross-tenant queue drain, run by the scheduled handler.
 *
 * Uses `PlatformDb` deliberately: this is one of the few operations that must
 * span organizations. Messages are claimed with a conditional update so two
 * overlapping cron invocations cannot both send the same message.
 */
export class QueueWorker {
  constructor(private readonly db: PlatformDb) {}

  async claimBatch(limit = DRAIN_BATCH_SIZE): Promise<PendingMessage[]> {
    const staleLock = toIso(new Date(Date.now() - LOCK_MINUTES * 60_000));
    const candidates = await this.db.all<PendingMessage>(
      `select m.id, m.organization_id, m.customer_id, m.template_key, m.body, m.to_phone, m.attempts,
              m.campaign_id, o.name as business_name
       from message_queue m join organizations o on o.id = m.organization_id
       where m.status = 'queued'
         and m.scheduled_for <= ?
         and (m.locked_at is null or m.locked_at < ?)
         and o.suspended_at is null
       order by m.scheduled_for asc limit ?`,
      [nowIso(), staleLock, limit]
    );

    const claimed: PendingMessage[] = [];
    for (const message of candidates) {
      // The `locked_at` predicate makes the claim atomic: only one run wins.
      const result = await this.db.run(
        `update message_queue set locked_at = ?, updated_at = ?
         where id = ? and status = 'queued' and (locked_at is null or locked_at < ?)`,
        [nowIso(), nowIso(), message.id, staleLock]
      );
      if (result.meta.changes === 1) claimed.push(message);
    }
    return claimed;
  }

  async markSent(id: string, externalId: string | undefined): Promise<void> {
    await this.db.run(
      `update message_queue set status = 'sent', sent_at = ?, provider_message_id = ?, locked_at = null,
         attempts = attempts + 1, last_error = null, updated_at = ? where id = ?`,
      [nowIso(), externalId ?? null, nowIso(), id]
    );
  }

  /**
   * Records a delivery failure, scheduling a retry with backoff while attempts
   * remain and the error is transient.
   */
  async markFailed(message: PendingMessage, error: string, retryable: boolean): Promise<void> {
    const attempts = message.attempts + 1;
    const canRetry = retryable && attempts < MAX_ATTEMPTS;

    if (canRetry) {
      const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 120;
      await this.db.run(
        `update message_queue set status = 'queued', attempts = ?, last_error = ?, locked_at = null,
           scheduled_for = ?, updated_at = ? where id = ?`,
        [attempts, error.slice(0, 500), toIso(new Date(Date.now() + delay * 60_000)), nowIso(), message.id]
      );
      return;
    }

    await this.db.run(
      `update message_queue set status = 'failed', attempts = ?, last_error = ?, locked_at = null, updated_at = ?
       where id = ?`,
      [attempts, error.slice(0, 500), nowIso(), message.id]
    );

    if (message.campaign_id) {
      await this.db.run("update campaign_recipients set status = 'failed' where message_id = ?", [message.id]);
    }
  }

  /** Marks a message unsendable because its organization has no connected number. */
  async markUnconfigured(id: string): Promise<void> {
    await this.db.run(
      `update message_queue set status = 'blocked', last_error = 'No WhatsApp Business number connected',
         locked_at = null, updated_at = ? where id = ?`,
      [nowIso(), id]
    );
  }

  /**
   * Sends one claimed message using its own organization's credentials.
   *
   * Template parameters are rebuilt from the stored body's variables rather than
   * re-queried, so a message that was queued days ago sends exactly the wording
   * the salon reviewed.
   */
  async deliver(
    message: PendingMessage,
    credentials: WhatsAppCredentials,
    values: Record<string, string | number>
  ): Promise<void> {
    const template = getTemplate(message.template_key);
    if (!template) {
      await this.markFailed(message, `Unknown template ${message.template_key}`, false);
      return;
    }
    if (!message.to_phone) {
      await this.markFailed(message, "No destination phone number", false);
      return;
    }

    const client = new WhatsAppClient(credentials);
    const result = await client.sendTemplate({
      toPhone: message.to_phone,
      templateName: template.metaName,
      bodyParams: templateParams(template, values)
    });

    if (result.ok) {
      await this.markSent(message.id, result.externalId);
      if (message.campaign_id) {
        await this.db.run(
          "update campaign_recipients set status = 'sent' where message_id = ? and status = 'pending'",
          [message.id]
        );
      }
      if (message.customer_id) {
        await this.db.run("update customers set last_reminder_at = ? where id = ?", [nowIso(), message.customer_id]);
      }
      return;
    }

    await this.markFailed(message, `${result.errorCode}: ${result.errorMessage}`, result.retryable);

    // An invalid or expired token affects every future message for this tenant,
    // so the integration is deactivated and surfaced in their settings rather
    // than burning the whole queue against a dead credential.
    if (result.errorCode === "190") {
      await this.db.run(
        `update integrations set status = 'error', last_error = ?, updated_at = ?
         where organization_id = ? and provider = 'whatsapp_cloud'`,
        ["Access token rejected by Meta. Reconnect your WhatsApp number.", nowIso(), message.organization_id]
      );
    }
  }

  /** Removes long-settled queue rows so the table does not grow without bound. */
  async prune(retentionDays = 90): Promise<number> {
    const cutoff = toIso(addDays(new Date(), -retentionDays));
    const result = await this.db.run(
      "delete from message_queue where status in ('sent', 'failed', 'blocked') and updated_at < ?",
      [cutoff]
    );
    return result.meta.changes ?? 0;
  }
}
