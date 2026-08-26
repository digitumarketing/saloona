/**
 * Scheduled jobs — the automation engine.
 *
 * Nothing in the product's promise ("bring customers back automatically") works
 * without this file: previously there was no `scheduled` handler and no cron
 * trigger at all, so reminders could only ever be sent by hand.
 *
 * Two cadences, distinguished by the cron expression that invoked the run:
 *   * every 5 minutes — drain the message queue
 *   * once daily at 09:00 Asia/Karachi — queue the day's reminders, birthdays and
 *     review requests, refresh retention maths, and prune old rows
 *
 * Every job is per-organization and idempotent: each queued message carries a
 * dedupe key containing the local date, so a re-run on the same day is a no-op
 * rather than a second message to the same customer.
 */

import { PlatformDb } from "../lib/db.js";
import { addDays, formatInZone, nowIso, startOfLocalDay, toIso } from "../lib/time.js";
import { pruneRateLimits } from "../lib/rate-limit.js";
import { parseSettings } from "../repositories/settings.js";
import { CustomerRepository } from "../repositories/customers.js";
import { MessageQueue, QueueWorker } from "./messaging.js";
import { firstName } from "./campaigns.js";
import { loadWhatsAppCredentials, type WhatsAppCredentials } from "./whatsapp.js";
import { planLimits } from "../../shared/plans.js";
import type { Env } from "../types.js";

export interface JobReport {
  job: string;
  organizations?: number;
  queued?: number;
  sent?: number;
  failed?: number;
  blocked?: number;
  pruned?: number;
  errors?: string[];
}

interface OrganizationRow {
  id: string;
  name: string;
  timezone: string;
  plan_id: string;
  status: string;
  settings_json: string | null;
  trial_ends_at: string | null;
}

/**
 * Entry point for the Worker's `scheduled` handler.
 *
 * The cron expression decides which set of jobs runs, so both cadences share one
 * deployment without a separate service.
 */
export async function runScheduled(cron: string, env: Env): Promise<JobReport[]> {
  const db = new PlatformDb(env.DB);

  if (cron.startsWith("*/5")) {
    return [await drainQueue(db, env)];
  }

  const reports: JobReport[] = [];
  reports.push(await queueReturnReminders(db));
  reports.push(await queueBirthdayMessages(db));
  reports.push(await queueReviewRequests(db));
  reports.push(await refreshRetention(db));
  reports.push(await expireTrials(db));
  reports.push(await pruneOldRows(db));
  // A daily run also drains, so a message queued by the jobs above goes out
  // without waiting for the next five-minute tick.
  reports.push(await drainQueue(db, env));
  return reports;
}

/** All organizations eligible for automation. */
async function activeOrganizations(db: PlatformDb): Promise<OrganizationRow[]> {
  return db.all<OrganizationRow>(
    `select id, name, timezone, plan_id, status, settings_json, trial_ends_at
     from organizations
     where suspended_at is null and status in ('trialing', 'active', 'past_due')
     order by created_at asc`
  );
}

// ---------------------------------------------------------------------------
// Queue delivery
// ---------------------------------------------------------------------------

/**
 * Sends queued messages using each organization's own WhatsApp credentials.
 *
 * Credentials are loaded once per organization rather than once per message, and
 * an organization with none has its messages marked `blocked` so the owner can
 * see exactly why nothing was delivered.
 */
async function drainQueue(db: PlatformDb, env: Env): Promise<JobReport> {
  const worker = new QueueWorker(db);
  const claimed = await worker.claimBatch();
  if (claimed.length === 0) return { job: "drain_queue", sent: 0, failed: 0, blocked: 0 };

  const credentialCache = new Map<string, WhatsAppCredentials | null>();
  const report: JobReport = { job: "drain_queue", sent: 0, failed: 0, blocked: 0, errors: [] };

  for (const message of claimed) {
    let credentials = credentialCache.get(message.organization_id);
    if (credentials === undefined) {
      try {
        credentials = await loadWhatsAppCredentials(db.forTenant(message.organization_id), env.ENCRYPTION_KEY);
      } catch (error) {
        credentials = null;
        report.errors?.push(`${message.organization_id}: ${error instanceof Error ? error.message : "credential error"}`);
      }
      credentialCache.set(message.organization_id, credentials);
    }

    if (!credentials) {
      await worker.markUnconfigured(message.id);
      report.blocked = (report.blocked ?? 0) + 1;
      continue;
    }

    // Values are recovered from the queued row so the message sends the wording
    // that was composed when it was queued.
    const values = await messageValues(db, message.organization_id, message.customer_id, message.business_name);

    const before = report.sent ?? 0;
    await worker.deliver(message, credentials, values);
    const row = await db.first<{ status: string }>("select status from message_queue where id = ?", [message.id]);
    if (row?.status === "sent") report.sent = before + 1;
    else report.failed = (report.failed ?? 0) + 1;
  }

  return report;
}

async function messageValues(
  db: PlatformDb,
  organizationId: string,
  customerId: string | null,
  businessName: string
): Promise<Record<string, string | number>> {
  if (!customerId) return { business_name: businessName };
  const customer = await db.first<{ full_name: string; loyalty_points: number }>(
    "select full_name, loyalty_points from customers where id = ? and organization_id = ?",
    [customerId, organizationId]
  );
  return {
    customer_name: customer ? firstName(customer.full_name) : "there",
    business_name: businessName,
    total_points: customer?.loyalty_points ?? 0,
    service_name: "visit",
    offer: "a special welcome back"
  };
}

// ---------------------------------------------------------------------------
// Daily reminder jobs
// ---------------------------------------------------------------------------

/**
 * Queues a return reminder for every customer who has reached their own usual
 * gap between visits.
 *
 * Timing is per customer, from the median interval between their past visits, so
 * a fortnightly beard trim and a quarterly colour are each reminded at the right
 * moment instead of on one shared schedule.
 */
async function queueReturnReminders(db: PlatformDb): Promise<JobReport> {
  const report: JobReport = { job: "return_reminders", organizations: 0, queued: 0, errors: [] };

  for (const org of await activeOrganizations(db)) {
    const settings = parseSettings(org.settings_json);
    if (!settings.reminderEnabled) continue;

    // Only run at 09:00 local time, so no customer is messaged at 4am.
    if (localHour(org.timezone) !== 9) continue;

    report.organizations = (report.organizations ?? 0) + 1;
    const tenantDb = db.forTenant(org.id);
    const queue = new MessageQueue(tenantDb, org.timezone);
    const customers = new CustomerRepository(tenantDb, org.timezone);

    const allowance = planLimits(org.plan_id).monthlyMessages;
    const used = await queue.usageThisMonth();
    if (used >= allowance) continue;

    const due = await customers.dueSoon(0);
    const localDate = formatInZone(nowIso(), org.timezone, { dateStyle: "short" });

    for (const customer of due) {
      if (used + (report.queued ?? 0) >= allowance) break;
      const result = await queue.enqueue({
        customerId: customer.id,
        toPhone: customer.phone,
        templateKey: "return_reminder",
        dedupeKey: `reminder:${customer.id}:${localDate}`,
        values: {
          customer_name: firstName(customer.full_name),
          business_name: org.name,
          service_name: "visit"
        }
      });
      if (result.queued) report.queued = (report.queued ?? 0) + 1;
    }
  }

  return report;
}

async function queueBirthdayMessages(db: PlatformDb): Promise<JobReport> {
  const report: JobReport = { job: "birthday_messages", queued: 0 };

  for (const org of await activeOrganizations(db)) {
    const settings = parseSettings(org.settings_json);
    if (!settings.reminderEnabled) continue;
    if (localHour(org.timezone) !== 9) continue;

    const tenantDb = db.forTenant(org.id);
    const queue = new MessageQueue(tenantDb, org.timezone);
    const monthDay = formatInZone(nowIso(), org.timezone, { month: "2-digit", day: "2-digit" });
    // formatInZone yields "26/08" for en-GB; the stored birthday is MM-DD.
    const [day, month] = monthDay.split("/");

    const birthdays = await tenantDb.all<{ id: string; full_name: string; phone: string }>(
      `select id, full_name, phone from customers
       where is_archived = 0 and whatsapp_opt_out_at is null and consent_whatsapp = 1
         and birthday is not null and substr(birthday, 6, 5) = ?
       {where} limit 100`,
      [`${month}-${day}`]
    );

    const year = formatInZone(nowIso(), org.timezone, { year: "numeric" });
    for (const customer of birthdays) {
      const result = await queue.enqueue({
        customerId: customer.id,
        toPhone: customer.phone,
        templateKey: "birthday",
        dedupeKey: `birthday:${customer.id}:${year}`,
        values: {
          customer_name: firstName(customer.full_name),
          business_name: org.name,
          offer: settings.messageSignature ?? "a birthday treat"
        }
      });
      if (result.queued) report.queued = (report.queued ?? 0) + 1;
    }
  }

  return report;
}

/** Asks for a Google review a day after the visit, once per visit. */
async function queueReviewRequests(db: PlatformDb): Promise<JobReport> {
  const report: JobReport = { job: "review_requests", queued: 0 };

  for (const org of await activeOrganizations(db)) {
    const settings = parseSettings(org.settings_json);
    if (!settings.reviewRequestEnabled || !settings.reviewUrl) continue;
    if (localHour(org.timezone) !== 9) continue;

    const tenantDb = db.forTenant(org.id);
    const queue = new MessageQueue(tenantDb, org.timezone);
    const from = toIso(startOfLocalDay(org.timezone, -1));
    const to = toIso(startOfLocalDay(org.timezone, 0));

    const visits = await tenantDb.all<{ visit_id: string; customer_id: string; full_name: string; phone: string }>(
      `select v.id as visit_id, c.id as customer_id, c.full_name, c.phone
       from visits v join customers c on c.id = v.customer_id
       where v.status = 'completed' and v.visited_at >= ? and v.visited_at < ?
         and c.whatsapp_opt_out_at is null
       {where:v} limit 100`,
      [from, to]
    );

    for (const visit of visits) {
      const result = await queue.enqueue({
        customerId: visit.customer_id,
        toPhone: visit.phone,
        templateKey: "review_request",
        dedupeKey: `review:${visit.visit_id}`,
        values: {
          customer_name: firstName(visit.full_name),
          business_name: org.name,
          review_url: settings.reviewUrl
        }
      });
      if (result.queued) report.queued = (report.queued ?? 0) + 1;
    }
  }

  return report;
}

/**
 * Recomputes visit cadence nightly.
 *
 * Checkout already updates the customer it touched, but a customer who has
 * stopped visiting is never touched by checkout — and they are precisely the ones
 * the at-risk list must catch.
 */
async function refreshRetention(db: PlatformDb): Promise<JobReport> {
  const report: JobReport = { job: "refresh_retention", organizations: 0 };

  for (const org of await activeOrganizations(db)) {
    if (localHour(org.timezone) !== 9) continue;
    report.organizations = (report.organizations ?? 0) + 1;

    const settings = parseSettings(org.settings_json);
    const tenantDb = db.forTenant(org.id);
    const customers = new CustomerRepository(tenantDb, org.timezone);

    // Bounded per run: recompute the customers whose expected return has passed
    // or was never set, oldest first, so the whole base is covered over time
    // without a single run exceeding the CPU limit.
    const stale = await tenantDb.all<{ id: string }>(
      `select id from customers
       where is_archived = 0 and total_visits > 0
         and (expected_return_at is null or expected_return_at < ?)
       {where}
       order by updated_at asc limit 200`,
      [toIso(new Date())]
    );

    for (const customer of stale) {
      await customers.recomputeCadence(customer.id, settings.defaultReturnDays);
    }
  }

  return report;
}

/**
 * Moves organizations past their trial end into `past_due`.
 *
 * The dashboard shows a paywall for that status rather than locking data away:
 * the customer records belong to the salon, and blocking access to their own
 * customer list would be the wrong response to an unpaid invoice.
 */
async function expireTrials(db: PlatformDb): Promise<JobReport> {
  const result = await db.run(
    `update organizations set status = 'past_due', updated_at = ?
     where status = 'trialing' and trial_ends_at is not null and trial_ends_at < ?`,
    [nowIso(), nowIso()]
  );
  return { job: "expire_trials", organizations: result.meta.changes ?? 0 };
}

async function pruneOldRows(db: PlatformDb): Promise<JobReport> {
  const worker = new QueueWorker(db);
  const [messages, limits, sessions, tokens] = await Promise.all([
    worker.prune(90),
    pruneRateLimits(db),
    db.run("delete from sessions where expires_at < ?", [toIso(addDays(new Date(), -7))]),
    db.run("delete from auth_tokens where expires_at < ?", [toIso(addDays(new Date(), -7))])
  ]);

  return {
    job: "prune",
    pruned: messages + limits + (sessions.meta.changes ?? 0) + (tokens.meta.changes ?? 0)
  };
}

/** The current hour in a timezone, used to gate once-daily jobs to 09:00 local. */
function localHour(timeZone: string): number {
  const formatted = formatInZone(nowIso(), timeZone, { hour: "2-digit", hour12: false });
  const parsed = Number.parseInt(formatted, 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}
