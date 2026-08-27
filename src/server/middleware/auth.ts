/**
 * Authentication, tenancy, and CSRF middleware.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { AuthService, type Role, type SessionContext } from "../services/auth.js";
import { PlatformDb, TenantDb } from "../lib/db.js";
import type { AppEnv } from "../types.js";

export const SESSION_COOKIE = "sln_session";

/**
 * `SameSite=Strict` is viable because the dashboard and API are same-origin and
 * there is no third-party redirect flow into an authenticated page. Combined
 * with the origin check below this closes CSRF without a token round-trip.
 */
export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: isSecureRequest(c),
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecureRequest(c) });
}

/**
 * `Secure` is omitted on plain-HTTP localhost only. Setting it unconditionally
 * meant cookies were silently dropped during local development.
 */
function isSecureRequest(c: Context<AppEnv>): boolean {
  const url = new URL(c.req.url);
  if (url.protocol === "https:") return true;
  return !(url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export function requestMeta(c: Context<AppEnv>) {
  return {
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null
  };
}

export function platformDb(c: Context<AppEnv>): PlatformDb {
  return new PlatformDb(c.env.DB);
}

export function authService(c: Context<AppEnv>): AuthService {
  return new AuthService(platformDb(c));
}

/**
 * Resolves the session if one is present, without requiring it. Used by pages
 * that render differently for signed-in visitors.
 */
export const withSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const session = await authService(c).resolveSession(token);
    if (session) {
      c.set("session", session);
      c.set("db", new TenantDb(c.env.DB, session.organization.id));
    } else {
      // Token was valid-looking but is expired, revoked, or orphaned.
      clearSessionCookie(c);
    }
  }
  await next();
};

/**
 * Requires a valid session and establishes the tenant scope for the request.
 *
 * This is the only place an organization ID enters the request lifecycle.
 * Client-supplied values — the former `x-organization-id` header and
 * `organizationId` body field — are never consulted.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "Authentication required", code: "unauthenticated" }, 401);
  }
  if (session.organization.suspendedAt) {
    return c.json({ error: "This workspace is suspended", code: "suspended" }, 403);
  }
  await next();
};

/** Restricts a route to specific roles. Owner implicitly satisfies every check. */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "Authentication required", code: "unauthenticated" }, 401);
    if (session.user.role !== "owner" && !roles.includes(session.user.role)) {
      return c.json({ error: "You do not have permission to do this", code: "forbidden" }, 403);
    }
    await next();
  };
}

/**
 * Origin-based CSRF protection for cookie-authenticated state changes.
 *
 * Any unsafe method must carry an Origin (or Referer) header matching the
 * request host. Browsers always send Origin on cross-origin requests, so a
 * mismatch or absence on a state-changing call is rejected.
 */
export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  // Webhooks are server-to-server, carry no cookies, and authenticate by
  // signature instead.
  if (new URL(c.req.url).pathname.startsWith("/api/webhooks/")) return next();

  const host = c.req.header("host");
  const origin = c.req.header("origin");
  const referer = c.req.header("referer");
  const source = origin ?? referer;

  if (!source) {
    return c.json({ error: "Request blocked: missing origin", code: "csrf_blocked" }, 403);
  }

  // Compared against the request URL rather than the Host header. workerd builds
  // `request.url` from what Cloudflare actually routed on, so it is always
  // present, whereas a synthetic request may carry no Host header at all — which
  // previously made every write in the test suite fail as a CSRF violation. The
  // Host header is still honoured when present, since a proxy may rewrite one
  // without the other.
  const expectedHost = host ?? new URL(c.req.url).host;

  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return c.json({ error: "Request blocked: invalid origin", code: "csrf_blocked" }, 403);
  }

  if (sourceHost !== expectedHost) {
    return c.json({ error: "Request blocked: origin mismatch", code: "csrf_blocked" }, 403);
  }

  await next();
};

/** Reads the established session, throwing if middleware ordering is wrong. */
export function session(c: Context<AppEnv>): SessionContext {
  const value = c.get("session");
  if (!value) throw new Error("session() called on an unauthenticated route");
  return value;
}

/** Reads the tenant-scoped database handle for the current request. */
export function db(c: Context<AppEnv>): TenantDb {
  const value = c.get("db");
  if (!value) throw new Error("db() called on an unauthenticated route");
  return value;
}
