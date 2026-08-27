/**
 * Authentication routes.
 *
 * These replace the previous signup/login handlers, which set an unsigned `org`
 * cookie that the rest of the application trusted as proof of tenancy.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { AuthError, type RequestMeta } from "../services/auth.js";
import {
  loginSchema,
  parseBody,
  passwordResetRequestSchema,
  passwordResetSchema,
  signupSchema
} from "../lib/validation.js";
import { passwordResetEmail, sendEmail, verificationEmail } from "../lib/mail.js";
import {
  authService,
  clearSessionCookie,
  requestMeta,
  requireAuth,
  session,
  setSessionCookie
} from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import { baseUrl } from "../lib/url.js";

export const authRoutes = new Hono<AppEnv>();

/** Maps an AuthError onto its HTTP response, including Retry-After when rate limited. */
function authErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds) {
      c.header("retry-after", String(error.retryAfterSeconds));
    }
    return c.json({ error: error.message, code: error.code }, error.status as 400);
  }
  console.error("Unhandled auth error", error);
  return c.json({ error: "Something went wrong. Please try again.", code: "internal_error" }, 500);
}

authRoutes.post("/signup", async (c) => {
  const parsed = await parseBody(c.req.raw, signupSchema);
  if (!parsed.ok) return c.json({ error: "Please check the form", fields: parsed.errors }, 422);

  const meta: RequestMeta = requestMeta(c);
  try {
    const result = await authService(c).signup(parsed.data, meta);
    setSessionCookie(c, result.token, result.expiresAt);

    const verifyUrl = `${baseUrl(c)}/verify-email?token=${encodeURIComponent(result.verificationToken)}`;
    // Deliberately not awaited into the critical path beyond the response body:
    // a mail outage must not fail an otherwise successful signup.
    c.executionCtx.waitUntil(
      sendEmail(c.env, verificationEmail(parsed.data.email, parsed.data.ownerName, verifyUrl))
    );

    return c.json({ ok: true, redirect: "/app/setup" }, 201);
  } catch (error) {
    return authErrorResponse(c, error);
  }
});

authRoutes.post("/login", async (c) => {
  const parsed = await parseBody(c.req.raw, loginSchema);
  if (!parsed.ok) return c.json({ error: "Please check the form", fields: parsed.errors }, 422);

  try {
    const result = await authService(c).login(parsed.data, requestMeta(c));
    setSessionCookie(c, result.token, result.expiresAt);
    return c.json({ ok: true, redirect: "/app", user: result.user });
  } catch (error) {
    return authErrorResponse(c, error);
  }
});

authRoutes.post("/logout", async (c) => {
  const current = c.get("session");
  if (current) await authService(c).revokeSession(current.sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true, redirect: "/" });
});

authRoutes.post("/logout-everywhere", requireAuth, async (c) => {
  const current = session(c);
  await authService(c).revokeAllSessions(current.user.id);
  clearSessionCookie(c);
  return c.json({ ok: true, redirect: "/login" });
});

authRoutes.post("/password/forgot", async (c) => {
  const parsed = await parseBody(c.req.raw, passwordResetRequestSchema);
  if (!parsed.ok) return c.json({ error: "Please check the form", fields: parsed.errors }, 422);

  try {
    const result = await authService(c).requestPasswordReset(parsed.data.email, requestMeta(c));
    if (result) {
      const url = `${baseUrl(c)}/reset-password?token=${encodeURIComponent(result.token)}`;
      c.executionCtx.waitUntil(sendEmail(c.env, passwordResetEmail(parsed.data.email, url)));
    }
    // Identical response whether or not the address is registered.
    return c.json({ ok: true, message: "If that email is registered, a reset link is on its way." });
  } catch (error) {
    return authErrorResponse(c, error);
  }
});

authRoutes.post("/password/reset", async (c) => {
  const parsed = await parseBody(c.req.raw, passwordResetSchema);
  if (!parsed.ok) return c.json({ error: "Please check the form", fields: parsed.errors }, 422);

  try {
    await authService(c).resetPassword(parsed.data.token, parsed.data.password, requestMeta(c));
    clearSessionCookie(c);
    return c.json({ ok: true, redirect: "/login", message: "Password updated. Please sign in." });
  } catch (error) {
    return authErrorResponse(c, error);
  }
});

authRoutes.get("/session", async (c) => {
  const current = c.get("session");
  if (!current) return c.json({ authenticated: false }, 200);
  return c.json({
    authenticated: true,
    user: current.user,
    organization: current.organization
  });
});
