/**
 * Customer API.
 *
 * Every handler reads its tenant from the session-scoped `TenantDb`, so a
 * customer ID belonging to another organization simply does not resolve. This is
 * the surface that was previously readable and writable by anyone who sent an
 * `x-organization-id` header.
 */

import { Hono } from "hono";
import { db, session } from "../../middleware/auth.js";
import { apiError, pagination, validationError } from "../../lib/http.js";
import { customerCreateSchema, customerUpdateSchema, parseBody } from "../../lib/validation.js";
import { CustomerRepository } from "../../repositories/customers.js";
import { LoyaltyRepository } from "../../repositories/loyalty.js";
import { VisitRepository } from "../../repositories/visits.js";
import { SettingsRepository } from "../../repositories/settings.js";
import type { AppEnv } from "../../types.js";

export const customerRoutes = new Hono<AppEnv>();

function repo(c: Parameters<Parameters<typeof customerRoutes.get>[1]>[0]) {
  const context = session(c);
  return new CustomerRepository(db(c), context.organization.timezone);
}

customerRoutes.get("/", async (c) => {
  try {
    const { limit, cursor } = pagination(c);
    const result = await repo(c).list({
      search: c.req.query("search") ?? undefined,
      segment: (c.req.query("segment") as never) ?? "all",
      sort: (c.req.query("sort") as never) ?? "recent",
      limit,
      cursor
    });
    return c.json({
      customers: result.customers,
      nextCursor: result.hasMore ? cursor + limit : null
    });
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * The at-risk list — the product's headline screen.
 *
 * Each row carries how many days overdue the customer is against their own
 * pattern and the average value of their past visits, so the owner can see what
 * winning them back is worth before sending anything.
 */
customerRoutes.get("/at-risk", async (c) => {
  try {
    const { limit } = pagination(c, 50);
    const customers = await repo(c).atRisk({ limit });
    const totalRecoverable = customers.reduce((sum, customer) => sum + customer.recoverable_pkr, 0);
    return c.json({ customers, totalRecoverablePkr: totalRecoverable });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Customers whose usual gap says they are due back in the next few days. */
customerRoutes.get("/due-soon", async (c) => {
  try {
    const days = Number.parseInt(c.req.query("days") ?? "3", 10);
    const customers = await repo(c).dueSoon(Number.isFinite(days) ? Math.min(Math.max(days, 0), 30) : 3);
    return c.json({ customers });
  } catch (error) {
    return apiError(c, error);
  }
});

customerRoutes.post("/", async (c) => {
  const parsed = await parseBody(c.req.raw, customerCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const result = await repo(c).create(parsed.data);
    // A repeat phone number returns the existing record rather than a conflict:
    // at a busy reception desk, "this customer already exists, here they are" is
    // the useful answer.
    return c.json({ customer: result.customer, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    return apiError(c, error);
  }
});

customerRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const context = session(c);
    const tenantDb = db(c);

    const [customer, visits, redemptions, wallet] = await Promise.all([
      repo(c).get(id),
      new VisitRepository(tenantDb, context.organization.timezone).list({ customerId: id, limit: 50 }),
      new LoyaltyRepository(tenantDb).history(id),
      new LoyaltyRepository(tenantDb).wallet(id)
    ]);

    return c.json({ customer, visits, redemptions, wallet });
  } catch (error) {
    return apiError(c, error);
  }
});

customerRoutes.patch("/:id", async (c) => {
  const parsed = await parseBody(c.req.raw, customerUpdateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const customer = await repo(c).update(c.req.param("id"), parsed.data);
    return c.json({ customer });
  } catch (error) {
    return apiError(c, error);
  }
});

customerRoutes.delete("/:id", async (c) => {
  try {
    // Archived, not deleted: the visit history is the salon's record of its own
    // revenue and must survive a mistaken click.
    await repo(c).archive(c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Records a WhatsApp opt-out. Required for consent compliance. */
customerRoutes.post("/:id/opt-out", async (c) => {
  try {
    await repo(c).setWhatsappOptOut(c.req.param("id"), true);
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

customerRoutes.post("/:id/opt-in", async (c) => {
  try {
    await repo(c).setWhatsappOptOut(c.req.param("id"), false);
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Forces a cadence recompute, used after a manual visit-history correction. */
customerRoutes.post("/:id/recompute", async (c) => {
  try {
    const settings = await new SettingsRepository(db(c)).get();
    await repo(c).recomputeCadence(c.req.param("id"), settings.defaultReturnDays);
    return c.json({ customer: await repo(c).get(c.req.param("id")) });
  } catch (error) {
    return apiError(c, error);
  }
});
