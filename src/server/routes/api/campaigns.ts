/**
 * Campaign API — the win-back workflow.
 *
 * Sending is a two-step flow on purpose: the owner previews the audience, then
 * confirms. A single-click bulk send to a mis-selected segment costs them real
 * money with Meta and their customers' goodwill.
 */

import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { db, requireActiveSubscription, requireRole, session } from "../../middleware/auth.js";
import { apiError, validationError } from "../../lib/http.js";
import { campaignCreateSchema, parseBody } from "../../lib/validation.js";
import { CampaignService, type CampaignSegment } from "../../services/campaigns.js";
import { MESSAGE_TEMPLATES } from "../../services/templates.js";
import { MessageQueue } from "../../services/messaging.js";
import { planAllows, planLimits } from "../../../shared/plans.js";
import type { AppEnv } from "../../types.js";

export const campaignRoutes = new Hono<AppEnv>();

function service(c: Context<AppEnv>) {
  const context = session(c);
  return new CampaignService(db(c), {
    id: context.organization.id,
    name: context.organization.name,
    planId: context.organization.planId,
    timezone: context.organization.timezone
  });
}

/** Campaigns are a paid capability; Starter can send reminders but not campaigns. */
const requireCampaigns: MiddlewareHandler<AppEnv> = async (c, next) => {
  const context = session(c);
  if (!planAllows(context.organization.planId, "campaigns")) {
    return c.json(
      {
        error: "Win-back campaigns are available on the Growth plan and above.",
        code: "upgrade_required",
        requiredPlan: "growth"
      },
      402
    );
  }
  await next();
};

campaignRoutes.get("/templates", async (c) => {
  return c.json({ templates: MESSAGE_TEMPLATES });
});

campaignRoutes.get("/", async (c) => {
  try {
    const [campaigns, totals] = await Promise.all([service(c).list(), service(c).totals()]);
    return c.json({ campaigns, totals });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Audience preview: who would be messaged, and what that send would cost. */
campaignRoutes.get("/audience", async (c) => {
  try {
    const context = session(c);
    const segment = (c.req.query("segment") ?? "at_risk") as CampaignSegment;
    const customers = await service(c).audience(segment);
    const queue = new MessageQueue(db(c), context.organization.timezone);
    const used = await queue.usageThisMonth();
    const allowance = planLimits(context.organization.planId).monthlyMessages;

    return c.json({
      segment,
      count: customers.length,
      customers: customers.slice(0, 50),
      allowance: { used, total: allowance, remaining: Math.max(0, allowance - used) },
      withinAllowance: used + customers.length <= allowance
    });
  } catch (error) {
    return apiError(c, error);
  }
});

campaignRoutes.post("/", requireActiveSubscription, requireCampaigns, requireRole("manager"), async (c) => {
  const parsed = await parseBody(c.req.raw, campaignCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const context = session(c);
    const campaign = await service(c).create({ ...parsed.data, createdBy: context.user.id });
    return c.json({ campaign }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

campaignRoutes.post("/:id/send", requireActiveSubscription, requireCampaigns, requireRole("manager"), async (c) => {
  try {
    const result = await service(c).send(c.req.param("id"));
    return c.json({
      ...result,
      message: `${result.queued} message${result.queued === 1 ? "" : "s"} queued for delivery.`
    });
  } catch (error) {
    return apiError(c, error);
  }
});

campaignRoutes.get("/:id", async (c) => {
  try {
    return c.json({ campaign: await service(c).report(c.req.param("id")) });
  } catch (error) {
    return apiError(c, error);
  }
});
