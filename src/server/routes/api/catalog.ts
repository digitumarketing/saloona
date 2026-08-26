/**
 * Catalog API: services, staff, locations, and rewards.
 *
 * Writes are restricted to owners and managers — a receptionist should be able to
 * take payment without being able to change prices.
 */

import { Hono } from "hono";
import { db, requireRole } from "../../middleware/auth.js";
import { apiError, validationError } from "../../lib/http.js";
import {
  parseBody,
  rewardCreateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  staffCreateSchema,
  staffUpdateSchema
} from "../../lib/validation.js";
import { LocationRepository, RewardRepository, ServiceRepository, StaffRepository } from "../../repositories/catalog.js";
import type { AppEnv } from "../../types.js";

export const catalogRoutes = new Hono<AppEnv>();

const manage = requireRole("manager");

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

catalogRoutes.get("/services", async (c) => {
  try {
    const includeInactive = c.req.query("includeInactive") === "true";
    return c.json({ services: await new ServiceRepository(db(c)).list(includeInactive) });
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.post("/services", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, serviceCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ service: await new ServiceRepository(db(c)).create(parsed.data) }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.patch("/services/:id", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, serviceUpdateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ service: await new ServiceRepository(db(c)).update(c.req.param("id"), parsed.data) });
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.delete("/services/:id", manage, async (c) => {
  try {
    await new ServiceRepository(db(c)).deactivate(c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

catalogRoutes.get("/staff", async (c) => {
  try {
    const includeInactive = c.req.query("includeInactive") === "true";
    return c.json({ staff: await new StaffRepository(db(c)).list(includeInactive) });
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.post("/staff", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, staffCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ staff: await new StaffRepository(db(c)).create(parsed.data) }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.patch("/staff/:id", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, staffUpdateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ staff: await new StaffRepository(db(c)).update(c.req.param("id"), parsed.data) });
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.delete("/staff/:id", manage, async (c) => {
  try {
    await new StaffRepository(db(c)).deactivate(c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

catalogRoutes.get("/locations", async (c) => {
  try {
    return c.json({ locations: await new LocationRepository(db(c)).list() });
  } catch (error) {
    return apiError(c, error);
  }
});

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

catalogRoutes.get("/rewards", async (c) => {
  try {
    const includeInactive = c.req.query("includeInactive") === "true";
    return c.json({ rewards: await new RewardRepository(db(c)).list(includeInactive) });
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.post("/rewards", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, rewardCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ reward: await new RewardRepository(db(c)).create(parsed.data) }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

catalogRoutes.delete("/rewards/:id", manage, async (c) => {
  try {
    await new RewardRepository(db(c)).deactivate(c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});
