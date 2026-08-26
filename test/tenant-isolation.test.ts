/**
 * Tenant isolation.
 *
 * This is the regression test that matters most in the whole suite. The previous
 * build trusted a client-supplied `x-organization-id` header, so any salon could
 * read and write any other salon's customer list — the kind of failure that ends
 * a B2B product on day one. Isolation is now structural: every tenant-scoped
 * query carries a `{where}` marker that `TenantDb` rewrites into an
 * `organization_id = ?` predicate it, not the caller, supplies.
 *
 * Structural is not the same as proven. What follows seeds one salon with a full
 * set of records and then, as a second salon, walks every route that accepts an
 * ID and asserts a 404 — not a 200, and not a 500 either, because a crash on a
 * foreign ID still tells the caller the row exists.
 *
 * When a new ID-bearing endpoint is added, it belongs in this file. An untested
 * route is where the next `x-organization-id` will hide.
 */

import { describe, expect, it } from "vitest";
import { ok, signUpTenant, type Tenant } from "./helpers.js";

interface SeededRecords {
  customerId: string;
  serviceId: string;
  staffId: string;
  rewardId: string;
  visitId: string;
  campaignId: string;
}

/** Fills a salon with one of everything that has an ID a request can name. */
async function seed(tenant: Tenant): Promise<SeededRecords> {
  const { customer } = await ok<{ customer: { id: string } }>(
    tenant.post("/api/customers", {
      fullName: "Ayesha Khan",
      phone: "03211112222",
      consentWhatsapp: true
    })
  );

  const { service } = await ok<{ service: { id: string } }>(
    tenant.post("/api/catalog/services", { name: "Haircut", durationMinutes: 45, pricePkr: 2500 })
  );

  const { staff } = await ok<{ staff: { id: string } }>(
    tenant.post("/api/catalog/staff", { name: "Bilal", role: "Stylist" })
  );

  const { reward } = await ok<{ reward: { id: string } }>(
    tenant.post("/api/catalog/rewards", { name: "Free blow dry", pointsRequired: 50 })
  );

  const { visit } = await ok<{ visit: { id: string } }>(
    tenant.post("/api/visits", {
      customerId: customer.id,
      items: [{ serviceId: service.id, staffId: staff.id, quantity: 1, unitPricePkr: 2500 }],
      paymentMethod: "cash"
    })
  );

  const { campaign } = await ok<{ campaign: { id: string } }>(
    tenant.post("/api/campaigns", {
      name: "August win-back",
      segment: "at_risk",
      templateKey: "win_back",
      messageBody: "We miss you at Test Salon. Come back for 20% off."
    })
  );

  return {
    customerId: customer.id,
    serviceId: service.id,
    staffId: staff.id,
    rewardId: reward.id,
    visitId: visit.id,
    campaignId: campaign.id
  };
}

describe("tenant isolation", () => {
  it("hides every one of another salon's records behind a 404", async () => {
    const salonA = await signUpTenant(1);
    const salonB = await signUpTenant(2);
    const owned = await seed(salonA);

    // Reads. A foreign ID must be indistinguishable from one that never existed.
    const reads = [
      `/api/customers/${owned.customerId}`,
      `/api/visits/${owned.visitId}`,
      `/api/campaigns/${owned.campaignId}`,
      `/api/loyalty/wallet/${owned.customerId}`
    ];
    for (const path of reads) {
      const response = await salonB.get(path);
      expect(response.status, `GET ${path} leaked to another tenant`).toBe(404);
    }

    // Redemption history is a list, and a list of nothing is the right answer for
    // an ID this tenant cannot see. Asserted separately because the contract is
    // an empty array, not a 404.
    const history = await ok<{ redemptions: unknown[] }>(salonB.get(`/api/loyalty/history/${owned.customerId}`));
    expect(history.redemptions).toEqual([]);

    // Writes. These matter more than the reads: a successful write against a
    // foreign ID is data corruption, not just disclosure.
    const writes: Array<[string, () => Promise<Response>]> = [
      [`PATCH /api/customers/:id`, () => salonB.patch(`/api/customers/${owned.customerId}`, { fullName: "Hijacked" })],
      [`DELETE /api/customers/:id`, () => salonB.del(`/api/customers/${owned.customerId}`)],
      [`POST /api/customers/:id/opt-out`, () => salonB.post(`/api/customers/${owned.customerId}/opt-out`)],
      [`POST /api/customers/:id/opt-in`, () => salonB.post(`/api/customers/${owned.customerId}/opt-in`)],
      [`POST /api/customers/:id/recompute`, () => salonB.post(`/api/customers/${owned.customerId}/recompute`)],
      [
        `PATCH /api/catalog/services/:id`,
        () => salonB.patch(`/api/catalog/services/${owned.serviceId}`, { pricePkr: 1 })
      ],
      [`DELETE /api/catalog/services/:id`, () => salonB.del(`/api/catalog/services/${owned.serviceId}`)],
      [`PATCH /api/catalog/staff/:id`, () => salonB.patch(`/api/catalog/staff/${owned.staffId}`, { name: "Hijacked" })],
      [`DELETE /api/catalog/staff/:id`, () => salonB.del(`/api/catalog/staff/${owned.staffId}`)],
      [`DELETE /api/catalog/rewards/:id`, () => salonB.del(`/api/catalog/rewards/${owned.rewardId}`)],
      [`POST /api/visits/:id/void`, () => salonB.post(`/api/visits/${owned.visitId}/void`, { reason: "test" })],
      [`POST /api/campaigns/:id/send`, () => salonB.post(`/api/campaigns/${owned.campaignId}/send`)]
    ];
    for (const [label, send] of writes) {
      const response = await send();
      expect(response.status, `${label} accepted another tenant's ID`).toBe(404);
    }

    // And the record itself is untouched, which is the assertion a status code
    // alone cannot make: a 404 returned *after* a successful UPDATE is still a
    // successful UPDATE.
    const { customer } = await ok<{ customer: { full_name: string; is_archived: number } }>(
      salonA.get(`/api/customers/${owned.customerId}`)
    );
    expect(customer.full_name).toBe("Ayesha Khan");
    expect(customer.is_archived).toBe(0);
  });

  it("keeps list endpoints empty for a salon that has created nothing", async () => {
    const salonA = await signUpTenant(3);
    const salonB = await signUpTenant(4);
    await seed(salonA);

    const lists: Array<[string, string]> = [
      ["/api/customers", "customers"],
      ["/api/visits", "visits"],
      ["/api/catalog/services", "services"],
      ["/api/catalog/staff", "staff"],
      ["/api/catalog/rewards", "rewards"],
      ["/api/campaigns", "campaigns"]
    ];

    for (const [path, key] of lists) {
      const body = await ok<Record<string, unknown[]>>(salonB.get(path));
      expect(body[key], `GET ${path} returned another tenant's rows`).toEqual([]);
    }
  });

  it("reports zero on the dashboard for a salon with no activity", async () => {
    const salonA = await signUpTenant(5);
    const salonB = await signUpTenant(6);
    await seed(salonA);

    const bootstrap = await ok<{
      summary: { customers: { total: number }; month: { visits: number; revenuePkr: number } };
      atRisk: unknown[];
    }>(salonB.get("/api/bootstrap"));

    expect(bootstrap.summary.customers.total).toBe(0);
    expect(bootstrap.summary.month.visits).toBe(0);
    expect(bootstrap.atRisk).toEqual([]);
  });

  it("refuses to redeem one salon's reward against another salon's customer", async () => {
    const salonA = await signUpTenant(7);
    const salonB = await signUpTenant(8);
    const owned = await seed(salonA);

    // Both halves foreign, then one of each — the mixed cases are how a naive
    // "look up each ID separately" implementation gets caught.
    const ownCustomer = await ok<{ customer: { id: string } }>(
      salonB.post("/api/customers", { fullName: "Sara", phone: "03219998888" })
    );
    const ownReward = await ok<{ reward: { id: string } }>(
      salonB.post("/api/catalog/rewards", { name: "Free trim", pointsRequired: 1 })
    );

    const attempts = [
      { customerId: owned.customerId, rewardId: owned.rewardId },
      { customerId: owned.customerId, rewardId: ownReward.reward.id },
      { customerId: ownCustomer.customer.id, rewardId: owned.rewardId }
    ];

    for (const body of attempts) {
      const response = await salonB.post("/api/loyalty/redeem", body);
      expect(response.status, `redeem ${JSON.stringify(body)} was not rejected`).toBe(404);
    }
  });

  it("does not expose a salon's customer wallet through another salon's join slug", async () => {
    const salonA = await signUpTenant(9);
    const salonB = await signUpTenant(10);

    // A customer enrols at salon A via the QR code.
    const joined = await ok<{ walletToken: string }>(
      salonA.post(`/api/j/${salonA.slug}/join`, {
        fullName: "Nadia",
        phone: "03217776666",
        consentWhatsapp: true
      })
    );
    expect(joined.walletToken, "join did not return a wallet token").toBeTruthy();

    // The same token against salon B's slug is not a wallet.
    const crossed = await salonB.get(
      `/api/j/${salonB.slug}/wallet?token=${encodeURIComponent(joined.walletToken)}`
    );
    expect(crossed.status).toBe(401);

    // And it still works against salon A's, so the assertion above is about
    // tenancy rather than a token that was never valid in the first place.
    const own = await ok<{ customer: { name: string } }>(
      salonA.get(`/api/j/${salonA.slug}/wallet?token=${encodeURIComponent(joined.walletToken)}`)
    );
    expect(own.customer.name).toBe("Nadia");
  });
});
