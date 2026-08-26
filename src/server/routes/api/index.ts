/**
 * API router.
 *
 * Everything mounted here is behind `requireAuth`, so no handler needs to think
 * about tenancy: the session has already established which organization the
 * request belongs to, and `db(c)` is scoped to it.
 */

import { Hono } from "hono";
import { db, requireAuth, session } from "../../middleware/auth.js";
import { apiError } from "../../lib/http.js";
import { customerRoutes } from "./customers.js";
import { catalogRoutes } from "./catalog.js";
import { visitRoutes } from "./visits.js";
import { loyaltyRoutes } from "./loyalty.js";
import { campaignRoutes } from "./campaigns.js";
import { analyticsRoutes } from "./analytics.js";
import { settingsRoutes } from "./settings.js";
import { ServiceRepository, StaffRepository } from "../../repositories/catalog.js";
import { SettingsRepository } from "../../repositories/settings.js";
import { AnalyticsRepository } from "../../repositories/analytics.js";
import { CustomerRepository } from "../../repositories/customers.js";
import { CampaignService } from "../../services/campaigns.js";
import { MessageQueue } from "../../services/messaging.js";
import { getPlan, planLimits } from "../../../shared/plans.js";
import { nowIso, parseDbDate } from "../../lib/time.js";
import { absoluteUrl } from "../../lib/url.js";
import type { AppEnv } from "../../types.js";

export const apiRoutes = new Hono<AppEnv>();

apiRoutes.use("*", requireAuth);

/**
 * Everything the dashboard needs on first paint, in one request.
 *
 * The old shell rendered before its data existed and crashed on
 * `undefined.customers`; the SPA now blocks on this single call instead of
 * fanning out to eight endpoints and rendering half-loaded.
 */
apiRoutes.get("/bootstrap", async (c) => {
  try {
    const context = session(c);
    const tenantDb = db(c);
    const timezone = context.organization.timezone;

    const analytics = new AnalyticsRepository(tenantDb, timezone);
    const campaigns = new CampaignService(tenantDb, {
      id: context.organization.id,
      name: context.organization.name,
      planId: context.organization.planId,
      timezone
    });

    const [summary, series, atRisk, services, staff, settings, queue, campaignTotals, integration] = await Promise.all([
      analytics.dashboard(),
      analytics.revenueSeries(30),
      new CustomerRepository(tenantDb, timezone).atRisk({ limit: 10 }),
      new ServiceRepository(tenantDb).list(),
      new StaffRepository(tenantDb).list(),
      new SettingsRepository(tenantDb).get(),
      new MessageQueue(tenantDb, timezone).stats(),
      campaigns.totals(),
      // Several screens need to know whether messages can actually leave the
      // building. Without this the dashboard cheerfully reports queued messages
      // that have nowhere to go.
      tenantDb.first<{ status: string; display_name: string | null }>(
        "select status, display_name from integrations where provider = 'whatsapp_cloud' {where}"
      )
    ]);

    const trialEnds = parseDbDate(context.organization.trialEndsAt);
    const daysLeftInTrial = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
      : null;

    return c.json({
      user: context.user,
      organization: context.organization,
      plan: getPlan(context.organization.planId),
      limits: planLimits(context.organization.planId),
      trial: { endsAt: context.organization.trialEndsAt, daysLeft: daysLeftInTrial },
      summary,
      revenueSeries: series,
      atRisk,
      services,
      staff,
      settings,
      messageStats: queue,
      campaignTotals,
      whatsapp: {
        status: integration?.status ?? "not_connected",
        displayPhone: integration?.display_name ?? null
      },
      joinUrl: absoluteUrl(c, `/j/${context.organization.slug}`),
      // Drives the setup checklist: an empty salon needs guiding, not a dashboard
      // full of zeroes.
      setup: {
        hasServices: services.length > 0,
        hasStaff: staff.length > 0,
        hasCustomers: summary.customers.total > 0,
        hasVisits: summary.month.visits > 0,
        onboardingCompletedAt: settings.onboardingCompletedAt
      }
    });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Marks the setup wizard complete so it stops appearing. */
apiRoutes.post("/onboarding/complete", async (c) => {
  try {
    const settings = await new SettingsRepository(db(c)).update({ onboardingCompletedAt: nowIso() });
    return c.json({ settings });
  } catch (error) {
    return apiError(c, error);
  }
});

apiRoutes.route("/customers", customerRoutes);
apiRoutes.route("/catalog", catalogRoutes);
apiRoutes.route("/visits", visitRoutes);
apiRoutes.route("/loyalty", loyaltyRoutes);
apiRoutes.route("/campaigns", campaignRoutes);
apiRoutes.route("/analytics", analyticsRoutes);
apiRoutes.route("/settings", settingsRoutes);

apiRoutes.all("*", (c) => c.json({ error: "Unknown endpoint", code: "not_found" }, 404));
