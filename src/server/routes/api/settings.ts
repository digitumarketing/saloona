/**
 * Settings API: organization profile, loyalty rules, branches, the WhatsApp
 * connection, and the message log.
 *
 * The WhatsApp handlers are the sensitive part. Credentials are verified against
 * Meta before they are stored, sealed with AES-GCM, and never returned — the UI
 * only ever receives the connected display number and status.
 */

import { Hono } from "hono";
import { db, requireRole, session } from "../../middleware/auth.js";
import { apiError, validationError } from "../../lib/http.js";
import {
  locationCreateSchema,
  loyaltySettingsSchema,
  organizationUpdateSchema,
  parseBody,
  whatsappConnectSchema
} from "../../lib/validation.js";
import { SettingsRepository } from "../../repositories/settings.js";
import { LocationRepository } from "../../repositories/catalog.js";
import { MessageQueue } from "../../services/messaging.js";
import {
  WhatsAppClient,
  disconnectWhatsApp,
  saveWhatsAppCredentials
} from "../../services/whatsapp.js";
import { getPlan, planLimits } from "../../../shared/plans.js";
import { nowIso } from "../../lib/time.js";
import { absoluteUrl } from "../../lib/url.js";
import type { AppEnv } from "../../types.js";

export const settingsRoutes = new Hono<AppEnv>();

const manage = requireRole("manager");
const ownerOnly = requireRole();

settingsRoutes.get("/", async (c) => {
  try {
    const context = session(c);
    const tenantDb = db(c);
    const [settings, locations, integration, usage, profile] = await Promise.all([
      new SettingsRepository(tenantDb).get(),
      new LocationRepository(tenantDb).list(),
      tenantDb.first<{ status: string; display_name: string | null; connected_at: string | null; last_error: string | null }>(
        "select status, display_name, connected_at, last_error from integrations where provider = 'whatsapp_cloud' {where}"
      ),
      new MessageQueue(tenantDb, context.organization.timezone).usageThisMonth(),
      // Not part of the session context, but the Business tab cannot let an owner
      // edit a field it is unable to show them the current value of.
      tenantDb.organizationRow<{ phone: string | null; logo_url: string | null }>("phone, logo_url")
    ]);

    const limits = planLimits(context.organization.planId);

    return c.json({
      organization: context.organization,
      plan: getPlan(context.organization.planId),
      settings,
      profile: { phone: profile?.phone ?? null, logoUrl: profile?.logo_url ?? null },
      locations,
      whatsapp: integration
        ? {
            status: integration.status,
            displayPhone: integration.display_name,
            connectedAt: integration.connected_at,
            lastError: integration.last_error
          }
        : { status: "not_connected", displayPhone: null, connectedAt: null, lastError: null },
      usage: { messagesThisMonth: usage, messageAllowance: limits.monthlyMessages },
      // The QR code on the reception desk points here.
      joinUrl: absoluteUrl(c, `/j/${context.organization.slug}`)
    });
  } catch (error) {
    return apiError(c, error);
  }
});

settingsRoutes.patch("/loyalty", manage, async (c) => {
  const parsed = await parseBody(c.req.raw, loyaltySettingsSchema.partial());
  if (!parsed.ok) return validationError(c, parsed.errors);
  try {
    return c.json({ settings: await new SettingsRepository(db(c)).update(parsed.data) });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Review requests and the message signature, kept separate from loyalty rules. */
settingsRoutes.patch("/messaging", manage, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return validationError(c, { _: "Request body must be valid JSON" });

  const patch: Record<string, unknown> = {};
  if (typeof body.reviewRequestEnabled === "boolean") patch.reviewRequestEnabled = body.reviewRequestEnabled;
  if (typeof body.reminderEnabled === "boolean") patch.reminderEnabled = body.reminderEnabled;
  if (typeof body.messageSignature === "string") patch.messageSignature = body.messageSignature.slice(0, 200);
  if (typeof body.reviewUrl === "string") {
    if (body.reviewUrl && !/^https?:\/\//.test(body.reviewUrl)) {
      return validationError(c, { reviewUrl: "Enter a full URL starting with https://" });
    }
    patch.reviewUrl = body.reviewUrl || null;
  }

  try {
    return c.json({ settings: await new SettingsRepository(db(c)).update(patch) });
  } catch (error) {
    return apiError(c, error);
  }
});

settingsRoutes.patch("/organization", ownerOnly, async (c) => {
  const parsed = await parseBody(c.req.raw, organizationUpdateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  const updates: Array<[string, unknown]> = [];
  if (parsed.data.name) updates.push(["name", parsed.data.name]);
  if (parsed.data.phone) updates.push(["phone", parsed.data.phone]);
  if (parsed.data.timezone) updates.push(["timezone", parsed.data.timezone]);
  if (parsed.data.logoUrl) updates.push(["logo_url", parsed.data.logoUrl]);
  if (updates.length === 0) return c.json({ ok: true });

  try {
    await db(c).updateOrganization(
      `${updates.map(([column]) => `${column} = ?`).join(", ")}, updated_at = ?`,
      [...updates.map(([, value]) => value), nowIso()]
    );
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

/** Adding a branch is bounded by the plan's location limit. */
settingsRoutes.post("/locations", ownerOnly, async (c) => {
  const parsed = await parseBody(c.req.raw, locationCreateSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const context = session(c);
    const repository = new LocationRepository(db(c));
    const existing = await repository.list();
    const allowed = planLimits(context.organization.planId).locations;

    if (existing.length >= allowed) {
      return c.json(
        {
          error: `Your plan includes ${allowed} branch${allowed === 1 ? "" : "es"}. Upgrade to add more.`,
          code: "plan_limit_reached"
        },
        402
      );
    }

    return c.json({ location: await repository.create(parsed.data) }, 201);
  } catch (error) {
    return apiError(c, error);
  }
});

// ---------------------------------------------------------------------------
// WhatsApp connection
// ---------------------------------------------------------------------------

/**
 * Connects the organization's own WhatsApp Business number.
 *
 * The credentials are checked against Meta first: storing an unverified token
 * would mean the failure only surfaces hours later when a reminder silently
 * fails to send.
 */
settingsRoutes.post("/whatsapp", ownerOnly, async (c) => {
  const parsed = await parseBody(c.req.raw, whatsappConnectSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const client = new WhatsAppClient(parsed.data);
    const verification = await client.verify();
    if (!verification.ok) {
      return c.json(
        {
          error: `Meta rejected these credentials: ${verification.error ?? "unknown error"}`,
          code: "whatsapp_verification_failed"
        },
        400
      );
    }

    await saveWhatsAppCredentials(db(c), c.env.ENCRYPTION_KEY, {
      ...parsed.data,
      displayPhone: verification.displayPhone || parsed.data.displayPhone
    });

    const templates = await client.listTemplates();
    return c.json({
      ok: true,
      displayPhone: verification.displayPhone,
      templates: templates.filter((template) => template.status === "APPROVED")
    });
  } catch (error) {
    return apiError(c, error);
  }
});

settingsRoutes.delete("/whatsapp", ownerOnly, async (c) => {
  try {
    await disconnectWhatsApp(db(c));
    return c.json({ ok: true });
  } catch (error) {
    return apiError(c, error);
  }
});

// ---------------------------------------------------------------------------
// Message log
// ---------------------------------------------------------------------------

settingsRoutes.get("/messages", async (c) => {
  try {
    const context = session(c);
    const queue = new MessageQueue(db(c), context.organization.timezone);
    const [messages, stats, used] = await Promise.all([queue.recent(100), queue.stats(), queue.usageThisMonth()]);
    return c.json({
      messages,
      stats,
      usage: { used, allowance: planLimits(context.organization.planId).monthlyMessages }
    });
  } catch (error) {
    return apiError(c, error);
  }
});
