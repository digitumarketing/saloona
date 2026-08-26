/**
 * Analytics.
 *
 * The previous implementation reported "recovered revenue" from a column that
 * referenced a table which did not exist, so the figure could only ever be zero.
 * Every metric here is derived from rows that are actually written by the
 * checkout and campaign paths, and each is bounded by the organization's local
 * day so "today" means today in Karachi, not in UTC.
 */

import type { TenantDb } from "../lib/db.js";
import { startOfLocalDay, startOfLocalMonth, toIso } from "../lib/time.js";

export interface DashboardSummary {
  today: { visits: number; revenuePkr: number; newCustomers: number };
  month: { visits: number; revenuePkr: number; newCustomers: number; recoveredPkr: number; recoveredVisits: number };
  customers: { total: number; active: number; atRisk: number; lost: number };
  loyalty: { pointsOutstanding: number; redemptionsThisMonth: number };
  messaging: { sentThisMonth: number; queued: number; failed: number };
  retention: { repeatRatePercent: number; averageTicketPkr: number; averageVisitGapDays: number | null };
}

export class AnalyticsRepository {
  constructor(
    private readonly db: TenantDb,
    private readonly timezone = "Asia/Karachi"
  ) {}

  async dashboard(): Promise<DashboardSummary> {
    const dayStart = toIso(startOfLocalDay(this.timezone));
    const monthStart = toIso(startOfLocalMonth(this.timezone));

    const [today, month, customers, loyalty, messaging, retention] = await Promise.all([
      this.periodTotals(dayStart),
      this.periodTotals(monthStart),
      this.customerMix(),
      this.loyaltyTotals(monthStart),
      this.messagingTotals(monthStart),
      this.retentionTotals(monthStart)
    ]);

    const recovered = await this.recovered(monthStart);

    return {
      today: { visits: today.visits, revenuePkr: today.revenue, newCustomers: today.newCustomers },
      month: {
        visits: month.visits,
        revenuePkr: month.revenue,
        newCustomers: month.newCustomers,
        recoveredPkr: recovered.revenuePkr,
        recoveredVisits: recovered.visits
      },
      customers,
      loyalty,
      messaging,
      retention
    };
  }

  private async periodTotals(from: string) {
    const [visits, newCustomers] = await Promise.all([
      this.db.first<{ visits: number; revenue: number }>(
        `select count(*) as visits, coalesce(sum(total_pkr), 0) as revenue
         from visits where status = 'completed' and visited_at >= ? {where}`,
        [from]
      ),
      this.db.first<{ count: number }>("select count(*) as count from customers where created_at >= ? {where}", [from])
    ]);
    return {
      visits: visits?.visits ?? 0,
      revenue: visits?.revenue ?? 0,
      newCustomers: newCustomers?.count ?? 0
    };
  }

  /**
   * Customer mix by retention state, computed against each customer's own
   * expected return date rather than one global window.
   */
  private async customerMix() {
    const today = toIso(startOfLocalDay(this.timezone));
    const row = await this.db.first<{ total: number; active: number; at_risk: number; lost: number }>(
      `select
         count(*) as total,
         sum(case when expected_return_at is null or expected_return_at >= ? then 1 else 0 end) as active,
         sum(case when expected_return_at < ?
                   and julianday(?) - julianday(expected_return_at) <= 2 * coalesce(avg_gap_days, 30)
              then 1 else 0 end) as at_risk,
         sum(case when expected_return_at < ?
                   and julianday(?) - julianday(expected_return_at) > 2 * coalesce(avg_gap_days, 30)
              then 1 else 0 end) as lost
       from customers where is_archived = 0 {where}`,
      [today, today, today, today, today]
    );
    return {
      total: row?.total ?? 0,
      active: row?.active ?? 0,
      atRisk: row?.at_risk ?? 0,
      lost: row?.lost ?? 0
    };
  }

  private async loyaltyTotals(monthStart: string) {
    const [points, redemptions] = await Promise.all([
      this.db.first<{ total: number }>(
        "select coalesce(sum(loyalty_points), 0) as total from customers where is_archived = 0 {where}"
      ),
      this.db.first<{ count: number }>(
        "select count(*) as count from reward_redemptions where redeemed_at >= ? {where}",
        [monthStart]
      )
    ]);
    return { pointsOutstanding: points?.total ?? 0, redemptionsThisMonth: redemptions?.count ?? 0 };
  }

  private async messagingTotals(monthStart: string) {
    const row = await this.db.first<{ sent: number; queued: number; failed: number }>(
      `select
         sum(case when status = 'sent' and sent_at >= ? then 1 else 0 end) as sent,
         sum(case when status = 'queued' then 1 else 0 end) as queued,
         sum(case when status = 'failed' then 1 else 0 end) as failed
       from message_queue where 1 = 1 {where}`,
      [monthStart]
    );
    return { sentThisMonth: row?.sent ?? 0, queued: row?.queued ?? 0, failed: row?.failed ?? 0 };
  }

  private async retentionTotals(monthStart: string) {
    const [repeat, ticket, gap] = await Promise.all([
      this.db.first<{ repeat_customers: number; total_customers: number }>(
        `select
           sum(case when total_visits > 1 then 1 else 0 end) as repeat_customers,
           sum(case when total_visits > 0 then 1 else 0 end) as total_customers
         from customers where is_archived = 0 {where}`
      ),
      this.db.first<{ average: number }>(
        `select coalesce(avg(total_pkr), 0) as average from visits
         where status = 'completed' and visited_at >= ? {where}`,
        [monthStart]
      ),
      this.db.first<{ average: number | null }>(
        "select avg(avg_gap_days) as average from customers where avg_gap_days is not null {where}"
      )
    ]);

    const total = repeat?.total_customers ?? 0;
    return {
      repeatRatePercent: total > 0 ? Math.round(((repeat?.repeat_customers ?? 0) / total) * 100) : 0,
      averageTicketPkr: Math.round(ticket?.average ?? 0),
      averageVisitGapDays: gap?.average === null || gap?.average === undefined ? null : Math.round(gap.average)
    };
  }

  /**
   * Revenue attributable to win-back campaigns.
   *
   * Read from `campaign_recipients`, where a conversion is stamped by the
   * checkout when a targeted customer returns inside the attribution window.
   * This is the number that justifies the subscription, so it is deliberately
   * conservative: only a recorded, completed visit counts.
   */
  private async recovered(from: string) {
    const row = await this.db.first<{ visits: number; revenue: number }>(
      `select count(*) as visits, coalesce(sum(revenue_pkr), 0) as revenue
       from campaign_recipients
       where converted_at is not null and converted_at >= ? {where}`,
      [from]
    );
    return { visits: row?.visits ?? 0, revenuePkr: row?.revenue ?? 0 };
  }

  /** Revenue by day for the dashboard chart. */
  revenueSeries(days = 30): Promise<Array<{ day: string; revenue_pkr: number; visits: number }>> {
    const from = toIso(startOfLocalDay(this.timezone, -(days - 1)));
    return this.db.all<{ day: string; revenue_pkr: number; visits: number }>(
      `select date(visited_at) as day, coalesce(sum(total_pkr), 0) as revenue_pkr, count(*) as visits
       from visits where status = 'completed' and visited_at >= ? {where}
       group by date(visited_at) order by day asc`,
      [from]
    );
  }

  /**
   * Per-staff performance. Reads from `visit_items` so a bill split between two
   * stylists credits each with their own lines, which the old single-`staff_id`
   * visit model could not do.
   */
  staffPerformance(from: string): Promise<
    Array<{ staff_id: string; staff_name: string; services: number; revenue_pkr: number; customers: number }>
  > {
    return this.db.all(
      `select vi.staff_id, s.name as staff_name,
              count(*) as services,
              coalesce(sum(vi.total_pkr), 0) as revenue_pkr,
              count(distinct v.customer_id) as customers
       from visit_items vi
       join visits v on v.id = vi.visit_id
       join staff s on s.id = vi.staff_id
       where v.status = 'completed' and v.visited_at >= ? {where:vi}
       group by vi.staff_id, s.name
       order by revenue_pkr desc`,
      [from]
    );
  }

  /** Most-sold services, for pricing and rota decisions. */
  topServices(from: string, limit = 10): Promise<Array<{ service_name: string; bookings: number; revenue_pkr: number }>> {
    return this.db.all(
      `select vi.service_name, count(*) as bookings, coalesce(sum(vi.total_pkr), 0) as revenue_pkr
       from visit_items vi join visits v on v.id = vi.visit_id
       where v.status = 'completed' and v.visited_at >= ? {where:vi}
       group by vi.service_name order by revenue_pkr desc limit ?`,
      [from, Math.min(limit, 50)]
    );
  }
}
