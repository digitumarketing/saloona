/**
 * The paywall.
 *
 * Trial expiry was tracked but never enforced: the scheduler moved a lapsed
 * workspace to `past_due`, the dashboard showed a red banner saying "automated
 * messages are paused until payment clears", and then the server went on
 * queueing and sending them anyway. Nothing whatsoever followed from not paying,
 * which is the difference between a product that can charge and one that cannot.
 *
 * The line this file defends has two sides, and both matter:
 *
 *   - What stops is the automation the salon is paying for. Creating and sending
 *     campaigns returns 402.
 *   - What does NOT stop is access to their own records. The customer list
 *     belongs to the salon, and locking them out of it is the wrong response to
 *     an unpaid invoice. A regression that "fixes" the paywall by blocking reads
 *     would pass a naive test and be a serious product mistake.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ok, signUpTenant, type Tenant } from "./helpers.js";

/**
 * Lapses a workspace the way the nightly job would.
 *
 * Written directly rather than by running the scheduler so the test states its
 * precondition instead of depending on cron wiring to produce it.
 */
async function markPastDue(tenant: Tenant): Promise<void> {
  await env.DB.prepare("update organizations set status = 'past_due' where id = ?")
    .bind(tenant.organizationId)
    .run();
}

async function createCampaign(tenant: Tenant): Promise<Response> {
  return tenant.post("/api/campaigns", {
    name: "August win-back",
    segment: "at_risk",
    templateKey: "win_back",
    messageBody: "We miss you. Come back for 20% off."
  });
}

describe("subscription gate", () => {
  it("stops an unpaid workspace from sending, without touching its records", async () => {
    const salon = await signUpTenant(20);

    // A campaign created while the trial is still running, so the send below is
    // blocked by payment state and not by a missing row.
    const { campaign } = await ok<{ campaign: { id: string } }>(createCampaign(salon));

    await salon.post("/api/customers", {
      fullName: "Ayesha Khan",
      phone: "03211112222",
      consentWhatsapp: true
    });

    await markPastDue(salon);

    // 402, specifically. The dashboard turns "this needs payment" into a billing
    // prompt and "you cannot do this" into an error, so a 403 here would send the
    // owner somewhere that cannot help them.
    const created = await createCampaign(salon);
    expect(created.status, "an unpaid workspace created a campaign").toBe(402);

    const sent = await salon.post(`/api/campaigns/${campaign.id}/send`);
    expect(sent.status, "an unpaid workspace sent a campaign").toBe(402);
    expect((await sent.json<{ code: string }>()).code).toBe("payment_required");
  });

  it("leaves an unpaid workspace full access to its own data", async () => {
    const salon = await signUpTenant(21);
    const { customer } = await ok<{ customer: { id: string } }>(
      salon.post("/api/customers", {
        fullName: "Hina Siddiqui",
        phone: "03211113333",
        consentWhatsapp: true
      })
    );

    await markPastDue(salon);

    // Reads keep working.
    const list = await ok<{ customers: unknown[] }>(salon.get("/api/customers"));
    expect(list.customers.length).toBe(1);
    await ok(salon.get(`/api/customers/${customer.id}`));
    await ok(salon.get("/api/bootstrap"));

    // And so do writes against their own records: an unpaid invoice must not
    // cost a salon the ability to correct a customer's phone number.
    const updated = await salon.patch(`/api/customers/${customer.id}`, {
      fullName: "Hina Siddiqui-Raza"
    });
    expect(updated.status, "an unpaid workspace lost access to its own records").toBe(200);
  });

  it("keeps a paying workspace sending", async () => {
    // The gate must be checking payment state and nothing else — a test that only
    // asserts 402 would also pass if the route were broken for everyone.
    const salon = await signUpTenant(22);
    const created = await createCampaign(salon);
    expect(created.status, "a workspace inside its trial was blocked from sending").toBe(201);
  });
});
