const messageId = () => `msg_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;

export class MessageQueue {
  constructor(db) {
    this.db = db;
  }

  async enqueue({ organizationId, customerId, channel = "whatsapp", templateKey, body, scheduledFor }) {
    const ts = new Date().toISOString();
    const id = messageId();
    await this.db
      .prepare(
        "insert into message_queue (id, organization_id, customer_id, channel, provider, template_key, body, status, scheduled_for, created_at, updated_at) values (?, ?, ?, ?, 'business_owned', ?, ?, 'queued', ?, ?, ?)"
      )
      .bind(id, organizationId, customerId, channel, templateKey, body, scheduledFor ?? ts, ts, ts)
      .run();
    return { id, status: "queued" };
  }
}

export class WhatsAppProvider {
  constructor({ providerName = "manual", accessToken = null } = {}) {
    this.providerName = providerName;
    this.accessToken = accessToken;
  }

  async send(message) {
    if (this.providerName === "manual") {
      return { provider: "manual", status: "ready_for_staff", externalId: null };
    }
    return {
      provider: this.providerName,
      status: "stubbed",
      externalId: `stub_${message.id}`
    };
  }
}
