/**
 * Loyalty API: redeeming rewards and reading a customer's wallet.
 */

import { Hono } from "hono";
import { db } from "../../middleware/auth.js";
import { apiError, validationError } from "../../lib/http.js";
import { parseBody, redemptionSchema } from "../../lib/validation.js";
import { LoyaltyRepository } from "../../repositories/loyalty.js";
import type { AppEnv } from "../../types.js";

export const loyaltyRoutes = new Hono<AppEnv>();

loyaltyRoutes.post("/redeem", async (c) => {
  const parsed = await parseBody(c.req.raw, redemptionSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const result = await new LoyaltyRepository(db(c)).redeem(parsed.data.customerId, parsed.data.rewardId);
    return c.json(result, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

loyaltyRoutes.get("/wallet/:customerId", async (c) => {
  try {
    return c.json(await new LoyaltyRepository(db(c)).wallet(c.req.param("customerId")));
  } catch (error) {
    return apiError(c, error);
  }
});

loyaltyRoutes.get("/history/:customerId", async (c) => {
  try {
    return c.json({ redemptions: await new LoyaltyRepository(db(c)).history(c.req.param("customerId")) });
  } catch (error) {
    return apiError(c, error);
  }
});
