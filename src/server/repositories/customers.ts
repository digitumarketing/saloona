/**
 * Customer repository.
 *
 * Customers are the product's core asset, so this file carries the retention
 * intelligence: per-customer visit cadence (the median gap between visits) and
 * the derived "expected return" date that drives reminders and the at-risk list.
 */

import { NotFoundError, type TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { nowIso, parseDbDate, startOfLocalDay, addDays, toIso } from "../lib/time.js";

export interface CustomerRow {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  consent_whatsapp: number;
  loyalty_points: number;
  total_visits: number;
  lifetime_spend_pkr: number;
  avg_gap_days: number | null;
  expected_return_at: string | null;
  first_visit_at: string | null;
  last_visit_at: string | null;
  birthday: string | null;
  preferred_staff_id: string | null;
  whatsapp_opt_out_at: string | null;
  notes: string | null;
  is_archived: number;
  created_at: string;
}

export interface CustomerListOptions {
  search?: string;
  segment?: "all" | "at_risk" | "lapsed" | "new" | "loyal" | "never_returned" | "birthday_month";
  limit?: number;
  cursor?: number;
  sort?: "recent" | "name" | "spend" | "visits";
}

/** Status shown on the customer list, derived from cadence rather than a flat window. */
export type RetentionStatus = "new" | "active" | "due" | "at_risk" | "lost";

export interface CustomerSummary extends CustomerRow {
  retention_status: RetentionStatus;
  days_since_visit: number | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export class CustomerRepository {
  constructor(
    private readonly db: TenantDb,
    private readonly timezone = "Asia/Karachi"
  ) {}

  async list(options: CustomerListOptions = {}): Promise<{ customers: CustomerSummary[]; hasMore: boolean }> {
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(options.cursor ?? 0, 0);
    const clauses: string[] = ["is_archived = 0"];
    const params: unknown[] = [];

    if (options.search) {
      // Phone search tolerates the format the receptionist actually types.
      const digits = options.search.replace(/[^\d]/g, "");
      clauses.push("(full_name like ? collate nocase or phone like ?)");
      params.push(`%${options.search}%`, `%${digits.slice(-9)}%`);
    }

    const segmentClause = this.segmentClause(options.segment);
    if (segmentClause) {
      clauses.push(segmentClause.sql);
      params.push(...segmentClause.params);
    }

    const order =
      options.sort === "name"
        ? "full_name collate nocase asc"
        : options.sort === "spend"
          ? "lifetime_spend_pkr desc"
          : options.sort === "visits"
            ? "total_visits desc"
            : "coalesce(last_visit_at, created_at) desc";

    // One extra row is fetched to determine whether another page exists without
    // a second count query.
    const rows = await this.db.all<CustomerRow>(
      `select * from customers where ${clauses.join(" and ")} {where}
       order by ${order} limit ? offset ?`,
      [...params, limit + 1, offset]
    );

    const hasMore = rows.length > limit;
    return { customers: rows.slice(0, limit).map((row) => this.decorate(row)), hasMore };
  }

  /** SQL for each retention segment, expressed against the derived cadence columns. */
  private segmentClause(segment: CustomerListOptions["segment"]): { sql: string; params: unknown[] } | null {
    const today = toIso(startOfLocalDay(this.timezone));
    switch (segment) {
      case "at_risk":
        // Past their own expected return date but not yet written off.
        return {
          sql: "expected_return_at is not null and expected_return_at < ? and total_visits >= 2",
          params: [today]
        };
      case "lapsed":
        return { sql: "last_visit_at is not null and last_visit_at < ?", params: [toIso(addDays(new Date(), -90))] };
      case "never_returned":
        return { sql: "total_visits = 1", params: [] };
      case "loyal":
        return { sql: "total_visits >= 5", params: [] };
      case "new":
        return { sql: "created_at > ?", params: [toIso(addDays(new Date(), -30))] };
      case "birthday_month":
        return { sql: "birthday is not null and substr(birthday, 6, 2) = strftime('%m', 'now')", params: [] };
      default:
        return null;
    }
  }

  async get(id: string): Promise<CustomerSummary> {
    const row = await this.db.first<CustomerRow>("select * from customers where id = ? {where}", [id]);
    if (!row) throw new NotFoundError("Customer");
    return this.decorate(row);
  }

  async findByPhone(phone: string): Promise<CustomerRow | null> {
    return this.db.first<CustomerRow>("select * from customers where phone = ? {where}", [phone]);
  }

  /**
   * Creates a customer, or returns the existing record for that phone number.
   *
   * Phone is the identity in this market: a walk-in giving the same number twice
   * must not become two customers, or their visit history and points split.
   */
  async create(input: {
    fullName: string;
    phone: string;
    email?: string;
    consentWhatsapp?: boolean;
    birthday?: string;
    preferredStaffId?: string;
    notes?: string;
  }): Promise<{ customer: CustomerSummary; created: boolean }> {
    const existing = await this.findByPhone(input.phone);
    if (existing) {
      return { customer: this.decorate(existing), created: false };
    }

    const id = newId("customer");
    const ts = nowIso();
    await this.db.insert("customers", {
      id,
      full_name: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      consent_whatsapp: input.consentWhatsapp ? 1 : 0,
      birthday: input.birthday ?? null,
      preferred_staff_id: input.preferredStaffId ?? null,
      notes: input.notes ?? null,
      loyalty_points: 0,
      total_visits: 0,
      lifetime_spend_pkr: 0,
      is_archived: 0,
      created_at: ts,
      updated_at: ts
    });

    return { customer: await this.get(id), created: true };
  }

  async update(
    id: string,
    input: Partial<{
      fullName: string;
      phone: string;
      email: string;
      consentWhatsapp: boolean;
      birthday: string;
      preferredStaffId: string;
      notes: string;
    }>
  ): Promise<CustomerSummary> {
    const columns: Record<string, unknown> = {
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      consent_whatsapp: input.consentWhatsapp === undefined ? undefined : input.consentWhatsapp ? 1 : 0,
      birthday: input.birthday,
      preferred_staff_id: input.preferredStaffId,
      notes: input.notes
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      params.push(value);
    }
    if (sets.length === 0) return this.get(id);

    sets.push("updated_at = ?");
    params.push(nowIso());

    const result = await this.db.run(`update customers set ${sets.join(", ")} where id = ? {where}`, [...params, id]);
    if (result.meta.changes === 0) throw new NotFoundError("Customer");
    return this.get(id);
  }

  async archive(id: string): Promise<void> {
    const result = await this.db.run("update customers set is_archived = 1, updated_at = ? where id = ? {where}", [
      nowIso(),
      id
    ]);
    if (result.meta.changes === 0) throw new NotFoundError("Customer");
  }

  /**
   * Records or reverses a WhatsApp opt-out.
   *
   * Zero rows changed is an error, not a no-op. The `{where}` marker means a
   * customer ID belonging to another organization matches nothing, and answering
   * that with `{ ok: true }` would tell a receptionist a customer had been
   * unsubscribed when nothing happened at all — the one outcome consent handling
   * must never get wrong.
   */
  async setWhatsappOptOut(id: string, optOut: boolean): Promise<void> {
    const result = await this.db.run(
      "update customers set whatsapp_opt_out_at = ?, consent_whatsapp = ?, updated_at = ? where id = ? {where}",
      [optOut ? nowIso() : null, optOut ? 0 : 1, nowIso(), id]
    );
    if (result.meta.changes === 0) throw new NotFoundError("Customer");
  }

  // ---------------------------------------------------------------------------
  // Retention intelligence
  // ---------------------------------------------------------------------------

  /**
   * Recomputes visit cadence for one customer after a visit is recorded.
   *
   * The gap used is the **median** of the intervals between visits, not the
   * mean: a single six-month absence would otherwise drag a fortnightly
   * customer's expected return date out by weeks and suppress their reminder.
   * With fewer than three visits there is no meaningful distribution yet, so the
   * organization's default return window is used.
   */
  async recomputeCadence(customerId: string, defaultReturnDays: number): Promise<void> {
    const visits = await this.db.all<{ visited_at: string }>(
      "select visited_at from visits where customer_id = ? and status = 'completed' {where} order by visited_at desc limit 12",
      [customerId]
    );

    const dates = visits.map((v) => parseDbDate(v.visited_at)).filter((d): d is Date => d !== null);
    const totals = await this.db.first<{ visit_count: number; spend: number; first_visit: string | null }>(
      `select count(*) as visit_count, coalesce(sum(total_pkr), 0) as spend, min(visited_at) as first_visit
       from visits where customer_id = ? and status = 'completed' {where}`,
      [customerId]
    );

    let medianGap: number | null = null;
    if (dates.length >= 3) {
      const gaps: number[] = [];
      for (let i = 0; i < dates.length - 1; i += 1) {
        const gap = Math.round((dates[i]!.getTime() - dates[i + 1]!.getTime()) / 86_400_000);
        if (gap > 0) gaps.push(gap);
      }
      if (gaps.length > 0) {
        gaps.sort((a, b) => a - b);
        const middle = Math.floor(gaps.length / 2);
        medianGap =
          gaps.length % 2 === 0 ? Math.round(((gaps[middle - 1] ?? 0) + (gaps[middle] ?? 0)) / 2) : (gaps[middle] ?? null);
      }
    }

    const lastVisit = dates[0] ?? null;
    const expectedReturn = lastVisit ? toIso(addDays(lastVisit, medianGap ?? defaultReturnDays)) : null;

    await this.db.run(
      `update customers set
         avg_gap_days = ?, expected_return_at = ?, last_visit_at = ?,
         first_visit_at = coalesce(?, first_visit_at),
         total_visits = ?, lifetime_spend_pkr = ?, updated_at = ?
       where id = ? {where}`,
      [
        medianGap,
        expectedReturn,
        lastVisit ? toIso(lastVisit) : null,
        totals?.first_visit ?? null,
        totals?.visit_count ?? 0,
        totals?.spend ?? 0,
        nowIso(),
        customerId
      ]
    );
  }

  /**
   * The "Lost Customers" list — the feature the whole product is sold on.
   *
   * A customer is at risk when they are past their own expected return date by
   * more than the configured tolerance, so a monthly customer and a weekly
   * customer are judged on their own pattern rather than one global window.
   */
  async atRisk(options: { limit?: number; multiplier?: number } = {}): Promise<
    Array<CustomerSummary & { days_overdue: number; recoverable_pkr: number }>
  > {
    const limit = Math.min(options.limit ?? 50, MAX_LIMIT);
    const now = toIso(startOfLocalDay(this.timezone));

    const rows = await this.db.all<CustomerRow>(
      `select * from customers
       where is_archived = 0
         and total_visits >= 2
         and whatsapp_opt_out_at is null
         and expected_return_at is not null
         and expected_return_at < ?
       {where}
       order by lifetime_spend_pkr desc, expected_return_at asc
       limit ?`,
      [now, limit]
    );

    return rows.map((row) => {
      const expected = parseDbDate(row.expected_return_at);
      const daysOverdue = expected ? Math.max(0, Math.floor((Date.now() - expected.getTime()) / 86_400_000)) : 0;
      return {
        ...this.decorate(row),
        days_overdue: daysOverdue,
        // Average ticket, as the realistic value of winning this customer back.
        recoverable_pkr: row.total_visits > 0 ? Math.round(row.lifetime_spend_pkr / row.total_visits) : 0
      };
    });
  }

  /** Customers due back within the next `days`, for proactive reminders. */
  async dueSoon(days = 3): Promise<CustomerSummary[]> {
    const from = toIso(startOfLocalDay(this.timezone));
    const to = toIso(addDays(startOfLocalDay(this.timezone), days + 1));
    const rows = await this.db.all<CustomerRow>(
      `select * from customers
       where is_archived = 0 and whatsapp_opt_out_at is null
         and expected_return_at >= ? and expected_return_at < ?
       {where}
       order by expected_return_at asc limit ?`,
      [from, to, MAX_LIMIT]
    );
    return rows.map((row) => this.decorate(row));
  }

  private decorate(row: CustomerRow): CustomerSummary {
    const lastVisit = parseDbDate(row.last_visit_at);
    const daysSince = lastVisit ? Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000) : null;
    return { ...row, retention_status: retentionStatus(row, daysSince), days_since_visit: daysSince };
  }
}

/**
 * Classifies a customer against their own cadence.
 *
 * Thresholds are expressed as multiples of the customer's expected interval so
 * the same rule works for a weekly beard trim and a quarterly colour.
 */
export function retentionStatus(
  row: Pick<CustomerRow, "total_visits" | "expected_return_at" | "last_visit_at" | "avg_gap_days">,
  daysSince: number | null
): RetentionStatus {
  if (row.total_visits === 0 || daysSince === null) return "new";
  const expected = parseDbDate(row.expected_return_at);
  if (!expected) return daysSince > 90 ? "lost" : "active";

  const overdueDays = Math.floor((Date.now() - expected.getTime()) / 86_400_000);
  const interval = row.avg_gap_days ?? 30;

  if (overdueDays < 0) return "active";
  if (overdueDays <= Math.max(3, interval * 0.25)) return "due";
  if (overdueDays <= interval * 2) return "at_risk";
  return "lost";
}
