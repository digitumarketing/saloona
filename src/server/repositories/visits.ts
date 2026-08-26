/**
 * Visits — the checkout and money path.
 *
 * A visit is a bill: one row in `visits` plus one row per service in
 * `visit_items`. All amounts are whole PKR integers, and the bill total is
 * always recomputed server-side from the line items rather than trusted from
 * the client, so a tampered request cannot award loyalty points for a bill that
 * was never charged.
 */

import { NotFoundError, type TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { addDays, nowIso, parseDbDate, startOfLocalDay, toIso } from "../lib/time.js";

/** Days after a campaign message during which a visit counts as recovered. */
export const ATTRIBUTION_WINDOW_DAYS = 30;

export interface VisitItemInput {
  serviceId: string;
  staffId?: string;
  quantity: number;
  unitPricePkr: number;
  discountPkr: number;
}

export interface VisitInput {
  customerId: string;
  locationId?: string;
  items: VisitItemInput[];
  paymentMethod: string;
  paymentReference?: string;
  visitedAt?: string;
  notes?: string;
}

export interface VisitRow {
  id: string;
  customer_id: string;
  location_id: string | null;
  status: string;
  subtotal_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  points_earned: number;
  payment_method: string | null;
  payment_status: string;
  campaign_id: string | null;
  visited_at: string;
  notes: string | null;
  customer_name: string;
  customer_phone: string;
}

export interface VisitItemRow {
  id: string;
  service_id: string | null;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
  quantity: number;
  unit_price_pkr: number;
  discount_pkr: number;
  total_pkr: number;
}

export interface VisitWithItems extends VisitRow {
  items: VisitItemRow[];
}

/** Columns shared by the visit list and detail queries. */
const VISIT_COLUMNS = `v.id, v.customer_id, v.location_id, v.status, v.subtotal_pkr, v.discount_pkr,
  v.total_pkr, v.points_earned, v.payment_method, v.payment_status, v.campaign_id, v.visited_at, v.notes,
  c.full_name as customer_name, c.phone as customer_phone`;

export class VisitRepository {
  constructor(
    private readonly db: TenantDb,
    private readonly timezone = "Asia/Karachi"
  ) {}

  /**
   * Records a completed visit.
   *
   * The bill, its line items, the loyalty award, the payment record, and any
   * campaign attribution are written in a single batch. The previous code path
   * wrote the visit and then updated the customer separately, so a failure
   * between the two produced revenue with no loyalty points and a stale
   * `last_visit_at`.
   */
  async create(
    input: VisitInput,
    options: { pointsPerHundredPkr: number }
  ): Promise<{ visit: VisitWithItems; pointsEarned: number }> {
    const serviceIds = [...new Set(input.items.map((item) => item.serviceId))];
    const services = await this.db.all<{ id: string; name: string; price_pkr: number }>(
      `select id, name, price_pkr from services where id in (${serviceIds.map(() => "?").join(", ")}) {where}`,
      serviceIds
    );
    const serviceById = new Map(services.map((service) => [service.id, service]));
    // A service ID belonging to another tenant simply will not be found, because
    // the lookup is tenant-scoped.
    if (serviceById.size !== serviceIds.length) throw new NotFoundError("Service");

    const customer = await this.db.first<{ id: string }>("select id from customers where id = ? {where}", [
      input.customerId
    ]);
    if (!customer) throw new NotFoundError("Customer");

    const staffIds = [...new Set(input.items.map((item) => item.staffId).filter((id): id is string => Boolean(id)))];
    if (staffIds.length > 0) {
      const found = await this.db.all<{ id: string }>(
        `select id from staff where id in (${staffIds.map(() => "?").join(", ")}) {where}`,
        staffIds
      );
      if (found.length !== staffIds.length) throw new NotFoundError("Staff member");
    }

    const visitId = newId("visit");
    const ts = nowIso();
    const visitedAt = input.visitedAt ?? ts;

    let subtotal = 0;
    let discount = 0;
    const itemStatements = input.items.map((item) => {
      const service = serviceById.get(item.serviceId)!;
      const lineGross = item.unitPricePkr * item.quantity;
      // A discount can zero a line but never make it negative, which would
      // otherwise let a crafted request reduce the bill total below the sum of
      // the other lines.
      const lineDiscount = Math.min(item.discountPkr, lineGross);
      subtotal += lineGross;
      discount += lineDiscount;
      return this.db.insertStatement("visit_items", {
        id: newId("visitItem"),
        visit_id: visitId,
        service_id: item.serviceId,
        staff_id: item.staffId ?? null,
        service_name: service.name,
        quantity: item.quantity,
        unit_price_pkr: item.unitPricePkr,
        discount_pkr: lineDiscount,
        total_pkr: lineGross - lineDiscount,
        created_at: ts
      });
    });

    const total = subtotal - discount;
    // Integer maths: points are awarded per complete hundred rupees, so a
    // PKR 1,550 bill at 1 point per 100 earns 15, not 15.5.
    const pointsEarned = Math.floor((total / 100) * options.pointsPerHundredPkr);

    const attribution = await this.findAttribution(input.customerId, visitedAt);

    const statements: Array<{ sql: string; params: unknown[] }> = [
      this.db.insertStatement("visits", {
        id: visitId,
        location_id: input.locationId ?? null,
        customer_id: input.customerId,
        status: "completed",
        subtotal_pkr: subtotal,
        discount_pkr: discount,
        total_pkr: total,
        points_earned: pointsEarned,
        payment_method: input.paymentMethod,
        payment_status: input.paymentMethod === "unpaid" ? "unpaid" : "paid",
        campaign_id: attribution?.campaignId ?? null,
        visited_at: visitedAt,
        notes: input.notes ?? null,
        created_at: ts,
        updated_at: ts
      }),
      ...itemStatements,
      this.db.statement(
        `update customers set loyalty_points = loyalty_points + ?, last_visit_at = ?, updated_at = ?
         where id = ? {where}`,
        [pointsEarned, visitedAt, ts, input.customerId]
      )
    ];

    if (attribution) {
      statements.push(
        this.db.statement(
          `update campaign_recipients
           set converted_visit_id = ?, converted_at = ?, revenue_pkr = ?, status = 'converted'
           where id = ? {where}`,
          [visitId, ts, total, attribution.recipientId]
        )
      );
    }

    if (input.paymentMethod !== "unpaid") {
      statements.push(
        this.db.insertStatement("payments", {
          id: newId("payment"),
          customer_id: input.customerId,
          visit_id: visitId,
          provider: input.paymentMethod,
          type: "business_customer",
          amount_pkr: total,
          status: "succeeded",
          reference: input.paymentReference ?? null,
          created_at: ts,
          updated_at: ts
        })
      );
    }

    await this.db.batch(statements);

    return { visit: await this.get(visitId), pointsEarned };
  }

  /**
   * Finds an unconverted campaign message for this customer inside the
   * attribution window, so the win-back report can show revenue actually
   * recovered rather than messages merely sent.
   */
  private async findAttribution(
    customerId: string,
    visitedAt: string
  ): Promise<{ recipientId: string; campaignId: string } | null> {
    const visitDate = parseDbDate(visitedAt) ?? new Date();
    const since = toIso(addDays(visitDate, -ATTRIBUTION_WINDOW_DAYS));
    return this.db.first<{ recipientId: string; campaignId: string }>(
      `select id as recipientId, campaign_id as campaignId from campaign_recipients
       where customer_id = ? and converted_visit_id is null and created_at >= ? {where}
       order by created_at desc limit 1`,
      [customerId, since]
    );
  }

  async get(id: string): Promise<VisitWithItems> {
    const visit = await this.db.first<VisitRow>(
      `select ${VISIT_COLUMNS}
       from visits v join customers c on c.id = v.customer_id
       where v.id = ? {where:v}`,
      [id]
    );
    if (!visit) throw new NotFoundError("Visit");

    const items = await this.db.all<VisitItemRow>(
      `select vi.id, vi.service_id, vi.service_name, vi.staff_id, s.name as staff_name,
              vi.quantity, vi.unit_price_pkr, vi.discount_pkr, vi.total_pkr
       from visit_items vi left join staff s on s.id = vi.staff_id
       where vi.visit_id = ? {where:vi}
       order by vi.created_at asc`,
      [id]
    );

    return { ...visit, items };
  }

  /**
   * Visit list for the reception timeline and the customer history tab.
   *
   * Line items are summarised by a correlated subquery rather than a second
   * round trip, because the list only needs "Haircut, Beard trim" as a label.
   */
  async list(
    options: { customerId?: string; staffId?: string; limit?: number; cursor?: number; from?: string } = {}
  ): Promise<Array<VisitRow & { item_summary: string | null }>> {
    const limit = Math.min(options.limit ?? 25, 100);
    const clauses = ["v.status = 'completed'"];
    const params: unknown[] = [];

    if (options.customerId) {
      clauses.push("v.customer_id = ?");
      params.push(options.customerId);
    }
    if (options.from) {
      clauses.push("v.visited_at >= ?");
      params.push(options.from);
    }
    if (options.staffId) {
      clauses.push("exists (select 1 from visit_items vi2 where vi2.visit_id = v.id and vi2.staff_id = ?)");
      params.push(options.staffId);
    }

    return this.db.all<VisitRow & { item_summary: string | null }>(
      `select ${VISIT_COLUMNS},
              (select group_concat(vi.service_name, ', ') from visit_items vi where vi.visit_id = v.id) as item_summary
       from visits v join customers c on c.id = v.customer_id
       where ${clauses.join(" and ")} {where:v}
       order by v.visited_at desc limit ? offset ?`,
      [...params, limit, Math.max(options.cursor ?? 0, 0)]
    );
  }

  /**
   * Voids a visit and reverses its loyalty award. Recorded as a status change
   * rather than a delete so an already-issued receipt stays explainable.
   */
  async void(id: string): Promise<void> {
    const visit = await this.db.first<{ id: string; customer_id: string; points_earned: number; status: string }>(
      "select id, customer_id, points_earned, status from visits where id = ? {where}",
      [id]
    );
    if (!visit) throw new NotFoundError("Visit");
    if (visit.status === "void") return;

    await this.db.batch([
      this.db.statement("update visits set status = 'void', updated_at = ? where id = ? {where}", [nowIso(), id]),
      this.db.statement(
        `update customers set loyalty_points = max(0, loyalty_points - ?), updated_at = ? where id = ? {where}`,
        [visit.points_earned, nowIso(), visit.customer_id]
      ),
      this.db.statement("update payments set status = 'refunded', updated_at = ? where visit_id = ? {where}", [
        nowIso(),
        id
      ])
    ]);
  }

  /** Today's takings, bounded by the organization's own local day. */
  async todaySummary(): Promise<{ visits: number; revenue_pkr: number; new_customers: number }> {
    const from = toIso(startOfLocalDay(this.timezone));
    const [totals, newCustomers] = await Promise.all([
      this.db.first<{ visits: number; revenue_pkr: number }>(
        `select count(*) as visits, coalesce(sum(total_pkr), 0) as revenue_pkr
         from visits where status = 'completed' and visited_at >= ? {where}`,
        [from]
      ),
      this.db.first<{ count: number }>("select count(*) as count from customers where created_at >= ? {where}", [from])
    ]);
    return {
      visits: totals?.visits ?? 0,
      revenue_pkr: totals?.revenue_pkr ?? 0,
      new_customers: newCustomers?.count ?? 0
    };
  }
}
