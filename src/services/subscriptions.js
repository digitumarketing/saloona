export class DigitumSubscriptionBilling {
  constructor(db) {
    this.db = db;
  }

  async current(organizationId) {
    return this.db
      .prepare("select * from saas_subscriptions where organization_id = ? order by created_at desc limit 1")
      .bind(organizationId)
      .first();
  }

  async createInvoice({ organizationId, planId, amountPkr, dueAt }) {
    const id = `inv_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const ts = new Date().toISOString();
    await this.db
      .prepare(
        "insert into saas_invoices (id, organization_id, plan_id, amount_pkr, status, due_at, created_at, updated_at) values (?, ?, ?, ?, 'open', ?, ?, ?)"
      )
      .bind(id, organizationId, planId, amountPkr, dueAt, ts, ts)
      .run();
    return { id, status: "open" };
  }
}
