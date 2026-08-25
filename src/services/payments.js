const paymentId = () => `pay_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;

export const paymentProviders = {
  cash: { kind: "manual", label: "Cash" },
  raast: { kind: "manual", label: "Raast" },
  jazzcash: { kind: "adapter", label: "JazzCash" },
  easypaisa: { kind: "adapter", label: "Easypaisa" }
};

export class PaymentService {
  constructor(db) {
    this.db = db;
  }

  async recordManual({ organizationId, customerId, visitId = null, provider, amountPkr, reference = null }) {
    const ts = new Date().toISOString();
    const id = paymentId();
    await this.db
      .prepare(
        "insert into payments (id, organization_id, customer_id, visit_id, provider, type, amount_pkr, status, reference, created_at, updated_at) values (?, ?, ?, ?, ?, 'business_customer', ?, 'paid', ?, ?, ?)"
      )
      .bind(id, organizationId, customerId, visitId, provider, amountPkr, reference, ts, ts)
      .run();
    return { id, status: "paid" };
  }

  async createProviderIntent({ organizationId, customerId, provider, amountPkr }) {
    const ts = new Date().toISOString();
    const id = paymentId();
    await this.db
      .prepare(
        "insert into payments (id, organization_id, customer_id, provider, type, amount_pkr, status, reference, created_at, updated_at) values (?, ?, ?, ?, 'business_customer', ?, 'pending', ?, ?, ?)"
      )
      .bind(id, organizationId, customerId, provider, amountPkr, `intent_${id}`, ts, ts)
      .run();
    return { id, status: "pending", provider, checkoutUrl: null };
  }

  async handleWebhook(provider, payload) {
    return { provider, accepted: true, eventId: payload?.eventId ?? null, mode: "stub" };
  }
}
