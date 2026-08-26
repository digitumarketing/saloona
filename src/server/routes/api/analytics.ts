/**
 * Analytics API.
 *
 * Date ranges are resolved in the organization's timezone rather than UTC, so
 * "this month" means the calendar month the owner is actually living in.
 */

import { Hono } from "hono";
import { db, session } from "../../middleware/auth.js";
import { apiError } from "../../lib/http.js";
import { AnalyticsRepository } from "../../repositories/analytics.js";
import { startOfLocalDay, startOfLocalMonth, toIso } from "../../lib/time.js";
import { planAllows } from "../../../shared/plans.js";
import type { AppEnv } from "../../types.js";

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.get("/dashboard", async (c) => {
  try {
    const context = session(c);
    const analytics = new AnalyticsRepository(db(c), context.organization.timezone);
    const [summary, series] = await Promise.all([analytics.dashboard(), analytics.revenueSeries(30)]);
    return c.json({ summary, revenueSeries: series });
  } catch (error) {
    return apiError(c, error);
  }
});

analyticsRoutes.get("/staff", async (c) => {
  try {
    const context = session(c);
    if (!planAllows(context.organization.planId, "staff_reports")) {
      return c.json(
        { error: "Staff reports are available on the Growth plan and above.", code: "upgrade_required" },
        402
      );
    }
    const from = resolveFrom(c.req.query("period"), context.organization.timezone);
    const analytics = new AnalyticsRepository(db(c), context.organization.timezone);
    const [staff, services] = await Promise.all([analytics.staffPerformance(from), analytics.topServices(from)]);
    return c.json({ from, staff, services });
  } catch (error) {
    return apiError(c, error);
  }
});

analyticsRoutes.get("/services", async (c) => {
  try {
    const context = session(c);
    const from = resolveFrom(c.req.query("period"), context.organization.timezone);
    const services = await new AnalyticsRepository(db(c), context.organization.timezone).topServices(from, 20);
    return c.json({ from, services });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Named periods rather than free-form dates, so the range is always valid. */
function resolveFrom(period: string | undefined, timezone: string): string {
  switch (period) {
    case "today":
      return toIso(startOfLocalDay(timezone));
    case "week":
      return toIso(startOfLocalDay(timezone, -6));
    case "quarter":
      return toIso(startOfLocalDay(timezone, -89));
    case "year":
      return toIso(startOfLocalDay(timezone, -364));
    default:
      return toIso(startOfLocalMonth(timezone));
  }
}
