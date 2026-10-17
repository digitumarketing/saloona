/**
 * Sending by hand.
 *
 * The Starter plan has no connected WhatsApp number, so nothing drains the
 * queue. Instead of leaving those messages to pile up unsent, the salon opens
 * each one in WhatsApp from the reception phone and sends it; this endpoint is
 * how the queue learns that happened.
 *
 * Two properties matter and neither is obvious from reading the route:
 *
 *   - a message can only be marked once, so a double tap cannot inflate the
 *     sent count the monthly allowance is measured against
 *   - it is behind the paywall, unlike the rest of a past-due workspace's data
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ok, signUpTenant, type Tenant } from "./helpers.js";

/** Recording a visit queues a thank-you, which is the message to hand-send. */
async function seedQueuedMessage(tenant: Tenant): Promise<string> {
  const { customer } = await ok<{ customer: { id: string } }>(
    tenant.post("/api/customers", { fullName: "Ayesha Khan", phone: "03211112222", consentWhatsapp: true })
  );
  const { service } = await ok<{ service: { id: string } }>(
    tenant.post("/api/catalog/services", { name: "Haircut", pricePkr: 2500, durationMinutes: 30 })
  );
  await ok(
    tenant.post("/api/visits", {
      customerId: customer.id,
      items: [{ serviceId: service.id, quantity: 1, unitPricePkr: 2500 }],
      paymentMethod: "cash"
    })
  );

  const { messages } = await ok<{ messages: Array<{ id: string; status: string }> }>(
    tenant.get("/api/settings/messages")
  );
  const queued = messages.find((message) => message.status === "queued");
  if (!queued) throw new Error("Recording a visit did not queue a message");
  return queued.id;
}

async function markPastDue(tenant: Tenant): Promise<void> {
  await env.DB.prepare("update organizations set status = 'past_due' where id = ?")
    .bind(tenant.organizationId)
    .run();
}

describe("hand-send", () => {
  it("carries the phone number and body the wa.me link is built from", async () => {
    // The client builds `wa.me/<digits>?text=<body>` from these two fields. If
    // either stops being returned the button silently degrades to "No phone
    // number" with nothing failing anywhere else.
    const salon = await signUpTenant(30);
    await seedQueuedMessage(salon);

    const { messages } = await ok<{ messages: Array<{ to_phone: string | null; body: string }> }>(
      salon.get("/api/settings/messages")
    );

    expect(messages[0]!.to_phone, "no phone on the queued message").toBe("+923211112222");
    expect(messages[0]!.body.length).toBeGreaterThan(0);
  });

  it("marks a queued message sent, once and only once", async () => {
    const salon = await signUpTenant(31);
    const messageId = await seedQueuedMessage(salon);

    await ok(salon.post(`/api/settings/messages/${messageId}/sent`));

    const { messages } = await ok<{ messages: Array<{ id: string; status: string; provider: string }> }>(
      salon.get("/api/settings/messages")
    );
    const message = messages.find((entry) => entry.id === messageId)!;
    expect(message.status).toBe("sent");

    // `manual`, not the delivery provider: the log must not claim the platform
    // delivered something no API call ever touched.
    expect(message.provider).toBe("manual");

    // A second tap must not count again. Sent messages are what the monthly
    // allowance is measured against, so a re-markable message is a way to
    // inflate usage — or, from the salon's side, to lose a message that was
    // never actually sent twice.
    const again = await salon.post(`/api/settings/messages/${messageId}/sent`);
    expect(again.status, "a message was marked sent twice").toBe(404);
  });

  it("is paused for an unpaid workspace, while its customer list stays readable", async () => {
    const salon = await signUpTenant(32);
    const messageId = await seedQueuedMessage(salon);

    await markPastDue(salon);

    // Hand-sending is the Starter plan's entire delivery path. Leaving it open
    // after the trial lapses would hand that tier the whole product for free —
    // the hole the paywall exists to close, reopened on the cheaper plan.
    const blocked = await salon.post(`/api/settings/messages/${messageId}/sent`);
    expect(blocked.status, "an unpaid workspace sent a message by hand").toBe(402);

    // Their own records are untouched by that, deliberately.
    const list = await ok<{ customers: unknown[] }>(salon.get("/api/customers"));
    expect(list.customers.length).toBe(1);
  });
});
