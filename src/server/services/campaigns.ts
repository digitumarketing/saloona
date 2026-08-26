/**
 * Campaigns — the win-back engine.
 *
 * A campaign resolves a segment to a concrete list of customers, records one
 * `campaign_recipients` row per customer, and queues one message each. The
 * recipient row is what makes attribution possible: when a targeted customer
 * returns, checkout stamps the conversion and the revenue onto their row, so the
 * dashboard can report money actually recovered rather than messages sent.
 */

import { NotFoundError, type TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";
import { CustomerRepository, type CustomerSummary } from "../repositories/customers.js";
import { MessageQueue, MessageQuotaError } from "./messaging.js";
import { getTemplate } from "./templates.js";

export type CampaignSegment = "at_risk" | "lapsed" | "birthday_month" | "high_value" | "never_returned" | "all";

export interface CampaignRow {
  id: string;
  name: string;
  segment: string;
  template_key: string;
  message_body: string;
  offer_label: string | null;
  status: string;
  audience_count: number;
  sent_count: number;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CampaignReport extends CampaignRow {
  delivered: number;
  failed: number;
  conversions: number;
  revenue_pkr: number;
  conversion_rate_percent: number;
}

export class CampaignService {
  private readonly customers: CustomerRepository;
  private readonly queue: MessageQueue;

  constructor(
    private readonly db: TenantDb,
    private readonly organization: { id: string; name: string; planId: string; timezone: string }
  ) {
    this.customers = new CustomerRepository(db, organization.timezone);
    this.queue = new MessageQueue(db, organization.timezone);
  }

  /** Previews the audience so the owner sees who will be messaged before sending. */
  async audience(segment: CampaignSegment, limit = 500): Promise<CustomerSummary[]> {
    if (segment === "high_value") {
      const rows = await this.db.all<CustomerSummary>(
        `select * from customers
         where is_archived = 0 and whatsapp_opt_out_at is null and consent_whatsapp = 1
           and lifetime_spend_pkr > 0
         {where}
         order by lifetime_spend_pkr desc limit ?`,
        [limit]
      );
      return rows;
    }

    if (segment === "at_risk") {
      return this.customers.atRisk({ limit });
    }

    const result = await this.customers.list({ segment, limit });
    // Campaigns are marketing messages, so only customers who consented and have
    // not opted out are eligible — the filter belongs here, not in the UI.
    return result.customers.filter((customer) => customer.consent_whatsapp === 1 && !customer.whatsapp_opt_out_at);
  }

  async create(input: {
    name: string;
    segment: CampaignSegment;
    templateKey: string;
    messageBody: string;
    offerLabel?: string;
    createdBy: string;
  }): Promise<CampaignRow> {
    if (!getTemplate(input.templateKey)) throw new NotFoundError("Message template");

    const audience = await this.audience(input.segment);
    const id = newId("campaign");
    const ts = nowIso();

    await this.db.insert("campaigns", {
      id,
      name: input.name,
      segment: input.segment,
      template_key: input.templateKey,
      message_body: input.messageBody,
      offer_label: input.offerLabel ?? null,
      status: "draft",
      audience_count: audience.length,
      sent_count: 0,
      created_by: input.createdBy,
      created_at: ts,
      updated_at: ts
    });

    return this.get(id);
  }

  async get(id: string): Promise<CampaignRow> {
    const row = await this.db.first<CampaignRow>("select * from campaigns where id = ? {where}", [id]);
    if (!row) throw new NotFoundError("Campaign");
    return row;
  }

  list(limit = 25): Promise<CampaignRow[]> {
    return this.db.all<CampaignRow>("select * from campaigns where 1 = 1 {where} order by created_at desc limit ?", [
      Math.min(limit, 100)
    ]);
  }

  /**
   * Sends a campaign.
   *
   * The plan allowance is checked against the whole audience before anything is
   * queued, so a send either fits or is refused — a campaign that reaches half
   * its audience and stops is worse than one that never started, because the
   * owner cannot tell who was missed.
   */
  async send(id: string): Promise<{ queued: number; skipped: Array<{ customerId: string; reason: string }> }> {
    const campaign = await this.get(id);
    if (campaign.status === "sending" || campaign.status === "sent") {
      throw new Error("This campaign has already been sent.");
    }

    const audience = await this.audience(campaign.segment as CampaignSegment);
    if (audience.length === 0) {
      await this.db.run("update campaigns set status = 'sent', completed_at = ?, updated_at = ? where id = ? {where}", [
        nowIso(),
        nowIso(),
        id
      ]);
      return { queued: 0, skipped: [] };
    }

    await this.queue.assertQuota(this.organization.planId, audience.length);

    await this.db.run("update campaigns set status = 'sending', updated_at = ? where id = ? {where}", [nowIso(), id]);

    const ts = nowIso();
    const skipped: Array<{ customerId: string; reason: string }> = [];
    let queued = 0;

    for (const customer of audience) {
      const recipientId = newId("campaign");
      try {
        await this.db.insert("campaign_recipients", {
          id: recipientId,
          campaign_id: id,
          customer_id: customer.id,
          status: "pending",
          revenue_pkr: 0,
          created_at: ts
        });
      } catch {
        // The unique (campaign_id, customer_id) index means this customer was
        // already targeted by this campaign.
        skipped.push({ customerId: customer.id, reason: "already_targeted" });
        continue;
      }

      const result = await this.queue.enqueue({
        customerId: customer.id,
        toPhone: customer.phone,
        templateKey: campaign.template_key,
        campaignId: id,
        // One message per customer per campaign, whatever happens to the cron.
        dedupeKey: `campaign:${id}:${customer.id}`,
        values: {
          customer_name: firstName(customer.full_name),
          business_name: this.organization.name,
          offer: campaign.offer_label ?? "a special welcome back",
          service_name: "visit"
        }
      });

      if (result.queued && result.id) {
        await this.db.run("update campaign_recipients set message_id = ? where id = ? {where}", [result.id, recipientId]);
        queued += 1;
      } else {
        await this.db.run("update campaign_recipients set status = 'skipped' where id = ? {where}", [recipientId]);
        skipped.push({ customerId: customer.id, reason: result.reason ?? "unknown" });
      }
    }

    await this.db.run(
      "update campaigns set status = 'sent', sent_count = ?, completed_at = ?, updated_at = ? where id = ? {where}",
      [queued, nowIso(), nowIso(), id]
    );

    return { queued, skipped };
  }

  /** Per-campaign results, including revenue attributed inside the window. */
  async report(id: string): Promise<CampaignReport> {
    const campaign = await this.get(id);
    const stats = await this.db.first<{
      delivered: number;
      failed: number;
      conversions: number;
      revenue_pkr: number;
    }>(
      `select
         sum(case when status in ('sent', 'converted') then 1 else 0 end) as delivered,
         sum(case when status = 'failed' then 1 else 0 end) as failed,
         sum(case when converted_at is not null then 1 else 0 end) as conversions,
         coalesce(sum(revenue_pkr), 0) as revenue_pkr
       from campaign_recipients where campaign_id = ? {where}`,
      [id]
    );

    const delivered = stats?.delivered ?? 0;
    const conversions = stats?.conversions ?? 0;

    return {
      ...campaign,
      delivered,
      failed: stats?.failed ?? 0,
      conversions,
      revenue_pkr: stats?.revenue_pkr ?? 0,
      conversion_rate_percent: delivered > 0 ? Math.round((conversions / delivered) * 100) : 0
    };
  }

  /** Aggregate win-back performance for the dashboard headline. */
  async totals(): Promise<{ campaigns: number; messaged: number; recovered: number; revenue_pkr: number }> {
    const row = await this.db.first<{ messaged: number; recovered: number; revenue_pkr: number }>(
      `select count(*) as messaged,
              sum(case when converted_at is not null then 1 else 0 end) as recovered,
              coalesce(sum(revenue_pkr), 0) as revenue_pkr
       from campaign_recipients where 1 = 1 {where}`
    );
    const count = await this.db.first<{ count: number }>("select count(*) as count from campaigns where 1 = 1 {where}");
    return {
      campaigns: count?.count ?? 0,
      messaged: row?.messaged ?? 0,
      recovered: row?.recovered ?? 0,
      revenue_pkr: row?.revenue_pkr ?? 0
    };
  }
}

export { MessageQuotaError };

/** Messages address customers by first name; the full name reads as formal. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
