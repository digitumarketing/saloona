/**
 * Fixed-window rate limiting backed by D1.
 *
 * Login and signup previously had no throttling at all, leaving credential
 * brute-force and signup spam unmetered. Counters are keyed independently by IP
 * and by account so neither a single address nor a single target can be
 * attacked without limit.
 *
 * D1 is used rather than a dedicated store to avoid adding infrastructure at
 * this stage; the write volume is one row per attempt per window. Expired rows
 * are removed by the scheduled cleanup job.
 */

import type { PlatformDb } from "./db.js";
import { nowIso } from "./time.js";

export interface RateLimitRule {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** How long to block once the limit is exceeded, in seconds. */
  blockSeconds: number;
}

export const RATE_LIMITS = {
  loginByIp: { limit: 20, windowSeconds: 900, blockSeconds: 900 },
  loginByEmail: { limit: 8, windowSeconds: 900, blockSeconds: 1800 },
  signupByIp: { limit: 5, windowSeconds: 3600, blockSeconds: 3600 },
  passwordResetByEmail: { limit: 5, windowSeconds: 3600, blockSeconds: 3600 },
  customerJoinByIp: { limit: 30, windowSeconds: 3600, blockSeconds: 900 }
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry; only meaningful when blocked. */
  retryAfterSeconds: number;
}

interface RateLimitRow {
  key: string;
  hits: number;
  window_started_at: string;
  blocked_until: string | null;
}

/**
 * Records an attempt and reports whether it is permitted.
 *
 * Fails open on a database error: an availability problem in the limiter should
 * not lock every user out of the product. Auth still requires valid
 * credentials, so failing open costs throttling, not access.
 */
export async function checkRateLimit(
  db: PlatformDb,
  scope: keyof typeof RATE_LIMITS,
  identifier: string,
  rule: RateLimitRule = RATE_LIMITS[scope]
): Promise<RateLimitResult> {
  const key = `${scope}:${identifier.toLowerCase()}`;
  const now = new Date();

  try {
    const existing = await db.first<RateLimitRow>("select * from rate_limits where key = ?", [key]);

    if (existing?.blocked_until) {
      const blockedUntil = new Date(existing.blocked_until);
      if (blockedUntil > now) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)
        };
      }
    }

    const windowStart = existing ? new Date(existing.window_started_at) : null;
    const windowExpired =
      !windowStart || now.getTime() - windowStart.getTime() >= rule.windowSeconds * 1000;

    if (windowExpired) {
      await db.run(
        `insert into rate_limits (key, hits, window_started_at, blocked_until) values (?, 1, ?, null)
         on conflict(key) do update set hits = 1, window_started_at = excluded.window_started_at, blocked_until = null`,
        [key, nowIso()]
      );
      return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
    }

    const hits = (existing?.hits ?? 0) + 1;
    if (hits > rule.limit) {
      const blockedUntil = new Date(now.getTime() + rule.blockSeconds * 1000).toISOString();
      await db.run("update rate_limits set hits = ?, blocked_until = ? where key = ?", [hits, blockedUntil, key]);
      return { allowed: false, remaining: 0, retryAfterSeconds: rule.blockSeconds };
    }

    await db.run("update rate_limits set hits = ? where key = ?", [hits, key]);
    return { allowed: true, remaining: rule.limit - hits, retryAfterSeconds: 0 };
  } catch (error) {
    console.error("Rate limit check failed; allowing request", { scope, error });
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/** Clears a counter after a legitimate success, so one bad typo is not punished. */
export async function clearRateLimit(
  db: PlatformDb,
  scope: keyof typeof RATE_LIMITS,
  identifier: string
): Promise<void> {
  try {
    await db.run("delete from rate_limits where key = ?", [`${scope}:${identifier.toLowerCase()}`]);
  } catch (error) {
    console.error("Rate limit clear failed", { scope, error });
  }
}

/** Removes counters whose window and block period have both elapsed. */
export async function pruneRateLimits(db: PlatformDb, olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
  const result = await db.run(
    "delete from rate_limits where window_started_at < ? and (blocked_until is null or blocked_until < ?)",
    [cutoff, nowIso()]
  );
  return result.meta?.changes ?? 0;
}
