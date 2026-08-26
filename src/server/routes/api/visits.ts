/**
 * Checkout API — recording a visit.
 *
 * This is the endpoint the reception desk uses dozens of times a day, and the
 * only one that moves money and loyalty points, so the response deliberately
 * returns everything needed to print a receipt and tell the customer their new
 * balance without a second request.
 */

import { Hono } from "hono";
import { db, requireRole, session } from "../../middleware/auth.js";
import { apiError, pagination, validationError } from "../../lib/http.js";
import { parseBody, visitCreateSchema } from "../../lib/validation.js";
import { VisitRepository } from "../../repositories/visits.js";
import { CustomerRepository } from "../../repositories/customers.js";
import { SettingsRepository } from "../../repositories/settings.js";
import { MessageQueue } from "../../services/messaging.js";
import { firstName } from "../../services/campaigns.js";
import type { AppEnv } from "../../types.js";

export const visitRoutes = new Hono<AppEnv>();

visitRoutes.get("/", async (c) => {
  try {
    const context = session(c);
    const { limit, cursor } = pagination(c);
    const visits = await new VisitRepository(db(c), context.organization.timezone).list({
      customerId: c.req.query("customerId") ?? undefined,
      staffId: c.req.query("staffId") ?? undefined,
      from: c.req.query("from") ?? undefined,
      limit,
      cursor
    });
    return c.json({ visits, nextCursor: visits.length === limit ? cursor + limit : null });
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * Records a completed visit.
 *
 * After the bill is written, the customer's cadence is recomputed and a thank-you
 * message is queued. Both happen after the response is sent: the receptionist
 * should not wait on retention maths, and a messaging problem must never fail a
 * paid checkout.
 */
visitRoutes.post("/", async (c) => {
  const parsed = await parseBody(c.req.raw, visitCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const context = session(c);
    const tenantDb = db(c);
    const settings = await new SettingsRepository(tenantDb).get();
    const visits = new VisitRepository(tenantDb, context.organization.timezone);

    const result = await visits.create(parsed.data, { pointsPerHundredPkr: settings.pointsPerHundredPkr });

    c.executionCtx.waitUntil(
      (async () => {
        try {
          const customers = new CustomerRepository(tenantDb, context.organization.timezone);
          await customers.recomputeCadence(parsed.data.customerId, settings.defaultReturnDays);

          const customer = await customers.get(parsed.data.customerId);
          const queue = new MessageQueue(tenantDb, context.organization.timezone);
          await queue.enqueue({
            customerId: customer.id,
            toPhone: customer.phone,
            templateKey: "visit_thank_you",
            dedupeKey: `thanks:${result.visit.id}`,
            values: {
              customer_name: firstName(customer.full_name),
              business_name: context.organization.name,
              points: result.pointsEarned,
              total_points: customer.loyalty_points
            }
          });
        } catch (error) {
          console.error("Post-checkout follow-up failed", error);
        }
      })()
    );

    return c.json({ visit: result.visit, pointsEarned: result.pointsEarned }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

visitRoutes.get("/today", async (c) => {
  try {
    const context = session(c);
    return c.json(await new VisitRepository(db(c), context.organization.timezone).todaySummary());
  } catch (error) {
    return apiError(c, error);
  }
});

visitRoutes.get("/:id", async (c) => {
  try {
    const context = session(c);
    return c.json({ visit: await new VisitRepository(db(c), context.organization.timezone).get(c.req.param("id")) });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Voiding reverses revenue and points, so it is restricted to managers up. */
visitRoutes.post("/:id/void", requireRole("manager"), async (c) => {
  try {
    const context = session(c);
    const visits = new VisitRepository(db(c), context.organization.timezone);
    await visits.void(c.req.param("id"));

    c.executionCtx.waitUntil(
      (async () => {
        try {
          const visit = await visits.get(c.req.param("id"));
          const settings = await new SettingsRepository(db(c)).get();
          await new CustomerRepository(db(c), context.organization.timezone).recomputeCadence(
            visit.customer_id,
            settings.defaultReturnDays
          );
        } catch (error) {
          console.error("Cadence recompute after void failed", error);
        }
      })()
    );

    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});
