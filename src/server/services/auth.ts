/**
 * Authentication and session management.
 *
 * Replaces the previous model, in which an unsigned `org` cookie (or an
 * `x-organization-id` request header) was accepted as proof of identity. The
 * organization is now derived only from a session record that was created by a
 * successful password verification.
 */

import { PlatformDb, TenantDb } from "../lib/db.js";
import {
  generateOpaqueToken,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from "../lib/crypto.js";
import { newId } from "../lib/ids.js";
import { addDays, nowIso, toIso } from "../lib/time.js";
import { checkRateLimit, clearRateLimit } from "../lib/rate-limit.js";
import { planPrice } from "../../shared/plans.js";

const SESSION_DAYS = 30;
/** Sliding-expiry refresh threshold: only rewrite the row when it is stale. */
const SESSION_TOUCH_MINUTES = 60;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;
const TOKEN_TTL_HOURS = { email_verification: 48, password_reset: 1 } as const;

export type Role = "owner" | "manager" | "staff";

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
}

export interface SessionContext {
  user: AuthenticatedUser;
  sessionId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: string;
    planId: string;
    trialEndsAt: string | null;
    suspendedAt: string | null;
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface UserRow {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  password_version: string | null;
  role: Role;
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
  email_verified_at: string | null;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Generates a URL-safe slug for the public customer join link. */
function slugify(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || fallback;
}

export class AuthService {
  constructor(private readonly db: PlatformDb) {}

  // ---------------------------------------------------------------------------
  // Signup
  // ---------------------------------------------------------------------------

  /**
   * Creates an organization, its first location, the owner user, and a trial
   * subscription as a single atomic batch. The previous implementation issued
   * four independent writes, so a duplicate email left an orphaned
   * organization and location behind.
   */
  async signup(
    input: {
      businessName: string;
      ownerName: string;
      email: string;
      phone: string;
      password: string;
      planId: "starter" | "growth" | "scale";
      city?: string;
      timezone: string;
    },
    meta: RequestMeta
  ): Promise<{ organizationId: string; userId: string; token: string; expiresAt: string; verificationToken: string }> {
    const ipLimit = await checkRateLimit(this.db, "signupByIp", meta.ip ?? "unknown");
    if (!ipLimit.allowed) {
      throw new AuthError("Too many signup attempts. Please try again later.", 429, "rate_limited", ipLimit.retryAfterSeconds);
    }

    const existing = await this.db.first<{ id: string }>("select id from users where email = ?", [input.email]);
    if (existing) {
      // Reported explicitly rather than as a generic failure: the email is
      // already visible to whoever submitted the form, and a vague error here
      // produces support tickets rather than security.
      throw new AuthError("An account already exists for this email address.", 409, "email_taken");
    }

    const organizationId = newId("organization");
    const locationId = newId("location");
    const userId = newId("user");
    const subscriptionId = newId("subscription");
    const ts = nowIso();
    const trialEndsAt = toIso(addDays(new Date(), 14));
    const password = await hashPassword(input.password);
    const slug = await this.uniqueSlug(slugify(input.businessName, organizationId.slice(4)));

    await this.db.batch([
      {
        sql: `insert into organizations
                (id, name, slug, industry, plan_id, status, timezone, country, currency, phone, trial_ends_at, created_at, updated_at)
              values (?, ?, ?, 'salon', ?, 'trialing', ?, 'PK', 'PKR', ?, ?, ?, ?)`,
        params: [organizationId, input.businessName, slug, input.planId, input.timezone, input.phone, trialEndsAt, ts, ts]
      },
      {
        sql: `insert into locations (id, organization_id, name, city, phone, created_at, updated_at)
              values (?, ?, 'Main Branch', ?, ?, ?, ?)`,
        params: [locationId, organizationId, input.city ?? null, input.phone, ts, ts]
      },
      {
        sql: `insert into users
                (id, organization_id, name, email, phone, password_hash, password_salt, password_version, role, is_active, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, 'owner', 1, ?, ?)`,
        params: [userId, organizationId, input.ownerName, input.email, input.phone, password.hash, password.salt, password.version, ts, ts]
      },
      {
        sql: `insert into saas_subscriptions
                (id, organization_id, plan_id, status, amount_pkr, billing_period, started_at, next_invoice_at, created_at)
              values (?, ?, ?, 'trialing', ?, 'monthly', ?, ?, ?)`,
        params: [subscriptionId, organizationId, input.planId, planPrice(input.planId), ts, trialEndsAt, ts]
      }
    ]);

    await this.audit(organizationId, userId, "signup", meta);

    const session = await this.createSession(userId, organizationId, meta);
    const verificationToken = await this.issueToken(userId, organizationId, "email_verification");

    return { organizationId, userId, ...session, verificationToken };
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const clash = await this.db.first("select 1 from organizations where slug = ?", [candidate]);
      if (!clash) return candidate;
    }
    return `${base}-${newId("organization").slice(4, 10)}`;
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async login(
    input: { email: string; password: string },
    meta: RequestMeta
  ): Promise<{ token: string; expiresAt: string; user: AuthenticatedUser }> {
    const [ipLimit, emailLimit] = await Promise.all([
      checkRateLimit(this.db, "loginByIp", meta.ip ?? "unknown"),
      checkRateLimit(this.db, "loginByEmail", input.email)
    ]);
    const blocked = !ipLimit.allowed ? ipLimit : !emailLimit.allowed ? emailLimit : null;
    if (blocked) {
      throw new AuthError("Too many login attempts. Please try again later.", 429, "rate_limited", blocked.retryAfterSeconds);
    }

    const user = await this.db.first<UserRow>("select * from users where email = ?", [input.email]);

    // Always run a verification so response timing does not reveal whether the
    // address exists.
    const check = await verifyPassword(input.password, {
      hash: user?.password_hash ?? null,
      salt: user?.password_salt ?? null,
      version: user?.password_version ?? null
    });

    if (!user || !check.valid) {
      if (user) await this.recordFailedLogin(user);
      await this.audit(user?.organization_id ?? null, user?.id ?? null, "login_failed", meta, {
        email: input.email
      });
      throw new AuthError("Invalid email or password.", 401, "invalid_credentials");
    }

    if (!user.is_active) throw new AuthError("This account has been deactivated.", 403, "account_disabled");

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AuthError("Account temporarily locked after repeated failed attempts.", 423, "account_locked");
    }

    // Transparently move legacy SHA-256 records onto PBKDF2 now that the
    // plaintext is available and verified.
    if (check.needsUpgrade) {
      const upgraded = await hashPassword(input.password);
      await this.db.run(
        "update users set password_hash = ?, password_salt = ?, password_version = ?, updated_at = ? where id = ?",
        [upgraded.hash, upgraded.salt, upgraded.version, nowIso(), user.id]
      );
    }

    await this.db.run(
      "update users set failed_login_count = 0, locked_until = null, last_login_at = ?, updated_at = ? where id = ?",
      [nowIso(), nowIso(), user.id]
    );
    await Promise.all([
      clearRateLimit(this.db, "loginByEmail", input.email),
      this.audit(user.organization_id, user.id, "login", meta)
    ]);

    const session = await this.createSession(user.id, user.organization_id, meta);
    return {
      ...session,
      user: {
        id: user.id,
        organizationId: user.organization_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }

  private async recordFailedLogin(user: UserRow): Promise<void> {
    const count = (user.failed_login_count ?? 0) + 1;
    const lockedUntil =
      count >= MAX_FAILED_LOGINS ? toIso(new Date(Date.now() + LOCKOUT_MINUTES * 60_000)) : null;
    await this.db.run(
      "update users set failed_login_count = ?, locked_until = coalesce(?, locked_until), updated_at = ? where id = ?",
      [count, lockedUntil, nowIso(), user.id]
    );
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  /** Issues a session and returns the raw token; only its digest is stored. */
  private async createSession(
    userId: string,
    organizationId: string,
    meta: RequestMeta
  ): Promise<{ token: string; expiresAt: string }> {
    const token = generateSessionToken();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = toIso(addDays(new Date(), SESSION_DAYS));
    const ts = nowIso();

    await this.db.run(
      `insert into sessions (id, token_hash, user_id, organization_id, ip_address, user_agent, expires_at, last_seen_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId("session"), tokenHash, userId, organizationId, meta.ip, meta.userAgent?.slice(0, 300) ?? null, expiresAt, ts, ts]
    );

    return { token, expiresAt };
  }

  /**
   * Resolves a session token to its user and organization.
   *
   * This is the single source of tenant identity for authenticated requests.
   * Returns null for anything unrecognised, expired, revoked, or belonging to a
   * suspended organization.
   */
  async resolveSession(token: string | null | undefined): Promise<SessionContext | null> {
    if (!token) return null;

    const tokenHash = await hashSessionToken(token);
    const row = await this.db.first<{
      session_id: string;
      user_id: string;
      organization_id: string;
      name: string;
      email: string;
      role: Role;
      is_active: number;
      last_seen_at: string;
      org_name: string;
      slug: string;
      timezone: string;
      status: string;
      plan_id: string;
      trial_ends_at: string | null;
      suspended_at: string | null;
    }>(
      `select
         s.id as session_id, s.user_id, s.organization_id, s.last_seen_at,
         u.name, u.email, u.role, u.is_active,
         o.name as org_name, o.slug, o.timezone, o.status, o.plan_id, o.trial_ends_at, o.suspended_at
       from sessions s
       join users u on u.id = s.user_id
       join organizations o on o.id = s.organization_id
       where s.token_hash = ?
         and s.revoked_at is null
         and s.expires_at > ?`,
      [tokenHash, nowIso()]
    );

    if (!row || !row.is_active || row.suspended_at) return null;

    // Sliding expiry, written at most once an hour to limit write volume.
    const lastSeen = new Date(row.last_seen_at).getTime();
    if (Date.now() - lastSeen > SESSION_TOUCH_MINUTES * 60_000) {
      await this.db.run("update sessions set last_seen_at = ?, expires_at = ? where id = ?", [
        nowIso(),
        toIso(addDays(new Date(), SESSION_DAYS)),
        row.session_id
      ]);
    }

    return {
      sessionId: row.session_id,
      user: {
        id: row.user_id,
        organizationId: row.organization_id,
        name: row.name,
        email: row.email,
        role: row.role
      },
      organization: {
        id: row.organization_id,
        name: row.org_name,
        slug: row.slug,
        timezone: row.timezone,
        status: row.status,
        planId: row.plan_id,
        trialEndsAt: row.trial_ends_at,
        suspendedAt: row.suspended_at
      }
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.run("update sessions set revoked_at = ? where id = ? and revoked_at is null", [nowIso(), sessionId]);
  }

  /** Used on password change and by the "sign out everywhere" control. */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await this.db.run(
      `update sessions set revoked_at = ? where user_id = ? and revoked_at is null and id != coalesce(?, '')`,
      [nowIso(), userId, exceptSessionId ?? null]
    );
  }

  // ---------------------------------------------------------------------------
  // Email verification and password reset
  // ---------------------------------------------------------------------------

  private async issueToken(
    userId: string,
    organizationId: string,
    purpose: keyof typeof TOKEN_TTL_HOURS
  ): Promise<string> {
    const token = generateOpaqueToken();
    const expiresAt = toIso(new Date(Date.now() + TOKEN_TTL_HOURS[purpose] * 3_600_000));
    await this.db.run(
      `insert into auth_tokens (id, token_hash, user_id, organization_id, purpose, expires_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [newId("token"), await hashSessionToken(token), userId, organizationId, purpose, expiresAt, nowIso()]
    );
    return token;
  }

  /**
   * Starts a password reset. Always resolves successfully so the response does
   * not disclose whether an address is registered; the token is only returned
   * when a matching user exists, for the caller to email.
   */
  async requestPasswordReset(email: string, meta: RequestMeta): Promise<{ token: string; userId: string } | null> {
    const limit = await checkRateLimit(this.db, "passwordResetByEmail", email);
    if (!limit.allowed) {
      throw new AuthError("Too many reset requests. Please try again later.", 429, "rate_limited", limit.retryAfterSeconds);
    }

    const user = await this.db.first<{ id: string; organization_id: string }>(
      "select id, organization_id from users where email = ? and is_active = 1",
      [email]
    );
    if (!user) return null;

    const token = await this.issueToken(user.id, user.organization_id, "password_reset");
    await this.audit(user.organization_id, user.id, "password_reset_requested", meta);
    return { token, userId: user.id };
  }

  /**
   * Consumes a reset token and sets a new password. Every existing session for
   * the account is revoked, on the assumption that a reset may follow a
   * compromise.
   */
  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const tokenHash = await hashSessionToken(token);
    const row = await this.db.first<{ id: string; user_id: string; organization_id: string }>(
      `select id, user_id, organization_id from auth_tokens
       where token_hash = ? and purpose = 'password_reset' and consumed_at is null and expires_at > ?`,
      [tokenHash, nowIso()]
    );
    if (!row) throw new AuthError("This reset link is invalid or has expired.", 400, "invalid_token");

    const password = await hashPassword(newPassword);
    await this.db.batch([
      { sql: "update auth_tokens set consumed_at = ? where id = ?", params: [nowIso(), row.id] },
      {
        sql: `update users set password_hash = ?, password_salt = ?, password_version = ?,
                failed_login_count = 0, locked_until = null, updated_at = ? where id = ?`,
        params: [password.hash, password.salt, password.version, nowIso(), row.user_id]
      },
      {
        sql: "update sessions set revoked_at = ? where user_id = ? and revoked_at is null",
        params: [nowIso(), row.user_id]
      }
    ]);

    await this.audit(row.organization_id, row.user_id, "password_reset_completed", meta);
  }

  async verifyEmail(token: string): Promise<boolean> {
    const tokenHash = await hashSessionToken(token);
    const row = await this.db.first<{ id: string; user_id: string }>(
      `select id, user_id from auth_tokens
       where token_hash = ? and purpose = 'email_verification' and consumed_at is null and expires_at > ?`,
      [tokenHash, nowIso()]
    );
    if (!row) return false;

    await this.db.batch([
      { sql: "update auth_tokens set consumed_at = ? where id = ?", params: [nowIso(), row.id] },
      { sql: "update users set email_verified_at = ?, updated_at = ? where id = ?", params: [nowIso(), nowIso(), row.user_id] }
    ]);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  async audit(
    organizationId: string | null,
    userId: string | null,
    event: string,
    meta: RequestMeta,
    detail?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.db.run(
        `insert into audit_log (id, organization_id, user_id, event, ip_address, user_agent, detail_json, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("token"),
          organizationId,
          userId,
          event,
          meta.ip,
          meta.userAgent?.slice(0, 300) ?? null,
          detail ? JSON.stringify(detail) : null,
          nowIso()
        ]
      );
    } catch (error) {
      // Audit logging must never break the request it is recording.
      console.error("Audit write failed", { event, error });
    }
  }
}

/** Convenience accessor used by route handlers after the auth middleware runs. */
export function tenantDbFor(d1: D1Database, context: SessionContext): TenantDb {
  return new TenantDb(d1, context.organization.id);
}
