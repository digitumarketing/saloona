/**
 * Public customer API — the QR-code journey.
 *
 * These are the only unauthenticated endpoints that touch tenant data, so each
 * one resolves the organization from the public slug in the URL and then works
 * through a `TenantDb` scoped to it. A customer is identified by an opaque wallet
 * token held on their own device; only the token's digest is stored, so reading
 * the database does not yield working wallet links.
 *
 * The customer surface is a PWA reached by scanning a code at the reception desk.
 * There is no app store, no password, and no account to remember — that is a
 * deliberate product constraint for this market.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { PlatformDb, type TenantDb } from "../lib/db.js";
import { apiError, validationError } from "../lib/http.js";
import { customerJoinSchema, parseBody, walletOptOutSchema } from "../lib/validation.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { generateOpaqueToken, hashSessionToken } from "../lib/crypto.js";
import { nowIso } from "../lib/time.js";
import { CustomerRepository } from "../repositories/customers.js";
import { LoyaltyRepository } from "../repositories/loyalty.js";
import { VisitRepository } from "../repositories/visits.js";
import { parseSettings } from "../repositories/settings.js";
import type { AppEnv } from "../types.js";

export const WALLET_COOKIE = "sln_wallet";

export const publicRoutes = new Hono<AppEnv>();

interface PublicOrg {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  city: string | null;
  logoUrl: string | null;
  db: TenantDb;
}

/** Resolves the salon behind a public slug, or null if it is unknown/suspended. */
async function resolveOrg(c: Context<AppEnv>, slug: string): Promise<PublicOrg | null> {
  const platform = new PlatformDb(c.env.DB);
  const row = await platform.first<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    logo_url: string | null;
    city: string | null;
  }>(
    `select o.id, o.name, o.slug, o.timezone, o.logo_url,
            (select l.city from locations l where l.organization_id = o.id order by l.created_at limit 1) as city
     from organizations o
     where o.slug = ? and o.suspended_at is null`,
    [slug]
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    city: row.city,
    logoUrl: row.logo_url,
    db: platform.forTenant(row.id)
  };
}

/** Public salon profile shown on the join screen. */
publicRoutes.get("/:slug", async (c) => {
  try {
    const org = await resolveOrg(c, c.req.param("slug"));
    if (!org) return c.json({ error: "Salon not found", code: "not_found" }, 404);

    const rewards = await org.db.all<{ name: string; description: string | null; points_required: number }>(
      "select name, description, points_required from rewards where is_active = 1 {where} order by points_required asc limit 10"
    );
    const settings = parseSettings(
      (await org.db.organizationRow<{ settings_json: string | null }>("settings_json"))?.settings_json ?? null
    );

    return c.json({
      salon: { name: org.name, slug: org.slug, city: org.city, logoUrl: org.logoUrl },
      rewards,
      pointsPerHundredPkr: settings.pointsPerHundredPkr
    });
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * Customer self-enrolment.
 *
 * Rate limited by IP because this is public and writes rows. A phone number that
 * already exists returns that customer's wallet rather than creating a duplicate,
 * so a returning customer scanning the code again lands on their own points
 * balance instead of starting from zero.
 */
publicRoutes.post("/:slug/join", async (c) => {
  const org = await resolveOrg(c, c.req.param("slug"));
  if (!org) return c.json({ error: "Salon not found", code: "not_found" }, 404);

  const limit = await checkRateLimit(
    new PlatformDb(c.env.DB),
    "customerJoinByIp",
    c.req.header("cf-connecting-ip") ?? "unknown"
  );
  if (!limit.allowed) {
    c.header("retry-after", String(limit.retryAfterSeconds));
    return c.json({ error: "Too many attempts. Please try again shortly.", code: "rate_limited" }, 429);
  }

  const parsed = await parseBody(c.req.raw, customerJoinSchema);
  if (!parsed.ok) return validationError(c, parsed.errors);

  try {
    const customers = new CustomerRepository(org.db, org.timezone);
    const result = await customers.create({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      consentWhatsapp: parsed.data.consentWhatsapp,
      birthday: parsed.data.birthday
    });

    // An existing customer keeps their record; only their consent and name are
    // refreshed from what they just typed.
    if (!result.created) {
      await customers.update(result.customer.id, {
        fullName: parsed.data.fullName,
        consentWhatsapp: parsed.data.consentWhatsapp,
        birthday: parsed.data.birthday
      });
    }

    const token = await issueWalletToken(org.db, result.customer.id);
    setWalletCookie(c, token);

    return c.json(
      {
        ok: true,
        created: result.created,
        walletToken: token,
        walletUrl: `/j/${org.slug}/wallet`
      },
      result.created ? 201 : 200
    );
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * The customer wallet: points, next reward, and recent visits.
 *
 * The token may arrive as a cookie (normal PWA use) or as a query parameter (the
 * link in a WhatsApp message), and is looked up by digest.
 */
publicRoutes.get("/:slug/wallet", async (c) => {
  try {
    const org = await resolveOrg(c, c.req.param("slug"));
    if (!org) return c.json({ error: "Salon not found", code: "not_found" }, 404);

    const token = c.req.query("token") ?? getCookie(c, WALLET_COOKIE);
    if (!token) return c.json({ error: "No wallet on this device", code: "no_wallet" }, 401);

    const customer = await org.db.first<{
      id: string;
      full_name: string;
      phone: string;
      loyalty_points: number;
      whatsapp_opt_out_at: string | null;
    }>(
      "select id, full_name, phone, loyalty_points, whatsapp_opt_out_at from customers where wallet_token_hash = ? and is_archived = 0 {where}",
      [await hashSessionToken(token)]
    );
    if (!customer) return c.json({ error: "This wallet link is no longer valid", code: "invalid_wallet" }, 401);

    // Refreshes the cookie when the token arrived by link, so the next visit works
    // without the link.
    if (c.req.query("token")) setWalletCookie(c, token);

    const [wallet, visits, redemptions] = await Promise.all([
      new LoyaltyRepository(org.db).wallet(customer.id),
      new VisitRepository(org.db, org.timezone).list({ customerId: customer.id, limit: 10 }),
      new LoyaltyRepository(org.db).history(customer.id, 10)
    ]);

    return c.json({
      salon: { name: org.name, slug: org.slug, city: org.city, logoUrl: org.logoUrl },
      customer: {
        name: customer.full_name,
        phone: maskPhone(customer.phone),
        // Drives the messaging toggle, so it shows the customer's real state
        // rather than assuming they are subscribed.
        whatsappOptedOut: customer.whatsapp_opt_out_at !== null
      },
      wallet,
      // Only what the customer already knows: what they had done and what it cost.
      visits: visits.map((visit) => ({
        id: visit.id,
        visitedAt: visit.visited_at,
        services: visit.item_summary,
        totalPkr: visit.total_pkr,
        pointsEarned: visit.points_earned
      })),
      redemptions
    });
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * Lets a customer stop — or restart — WhatsApp messages from their wallet.
 *
 * Reversible on purpose. An accidental tap that permanently and silently removed
 * someone from a salon's list would need a phone call to reception to undo, and
 * the salon has no way to re-consent them on the customer's behalf.
 */
publicRoutes.post("/:slug/wallet/opt-out", async (c) => {
  try {
    const org = await resolveOrg(c, c.req.param("slug"));
    if (!org) return c.json({ error: "Salon not found", code: "not_found" }, 404);

    const token = getCookie(c, WALLET_COOKIE) ?? c.req.query("token");
    if (!token) return c.json({ error: "No wallet on this device", code: "no_wallet" }, 401);

    const customer = await org.db.first<{ id: string }>(
      "select id from customers where wallet_token_hash = ? {where}",
      [await hashSessionToken(token)]
    );
    if (!customer) return c.json({ error: "This wallet link is no longer valid", code: "invalid_wallet" }, 401);

    const parsed = await parseBody(c.req.raw, walletOptOutSchema);
    if (!parsed.ok) return validationError(c, parsed.errors);

    await new CustomerRepository(org.db, org.timezone).setWhatsappOptOut(customer.id, parsed.data.optOut);
    return c.json({ ok: true, optedOut: parsed.data.optOut });
  } catch (error) {
    return apiError(c, error);
  }
});

/**
 * Issues (or reissues) a wallet token for a customer.
 *
 * Reissuing replaces the previous token, which is also how a customer revokes
 * access from a device they no longer have.
 */
async function issueWalletToken(db: TenantDb, customerId: string): Promise<string> {
  const token = generateOpaqueToken();
  await db.run("update customers set wallet_token_hash = ?, updated_at = ? where id = ? {where}", [
    await hashSessionToken(token),
    nowIso(),
    customerId
  ]);
  return token;
}

function setWalletCookie(c: Context<AppEnv>, token: string): void {
  const url = new URL(c.req.url);
  setCookie(c, WALLET_COOKIE, token, {
    path: "/",
    httpOnly: true,
    // Lax rather than Strict: the customer arrives from a WhatsApp link, and a
    // Strict cookie would not be sent on that first cross-site navigation.
    sameSite: "Lax",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 365
  });
}

/** Confirms identity to the customer without printing their full number on screen. */
function maskPhone(phone: string): string {
  if (phone.length < 5) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

/** Used by the dashboard to hand a customer their wallet link over WhatsApp. */
export async function walletLinkFor(db: TenantDb, customerId: string, slug: string, origin: string): Promise<string> {
  const token = await issueWalletToken(db, customerId);
  return `${origin}/j/${slug}/wallet?token=${encodeURIComponent(token)}`;
}
