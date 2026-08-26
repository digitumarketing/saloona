/**
 * HTTP helpers: consistent error shapes and JSON responses.
 *
 * Every API error returns `{ error, code }`, with `fields` added for validation
 * failures so the UI can attach messages to individual inputs. Internal detail —
 * SQL, stack traces, provider responses — is logged but never returned.
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError, NotFoundError } from "./db.js";
import { AuthError } from "../services/auth.js";
import { EncryptionError } from "./encryption.js";
import { MessageQuotaError } from "../services/messaging.js";
import { RedemptionError } from "../repositories/loyalty.js";
import type { AppEnv } from "../types.js";

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string>;
  retryAfter?: number;
}

/**
 * Maps a thrown value onto its HTTP response.
 *
 * Domain errors carry their own status and a stable code the client can branch
 * on; anything unrecognised becomes a 500 with a generic message.
 */
export function toErrorResponse(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof AuthError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code, retryAfter: error.retryAfterSeconds }
    };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: error.message, code: "not_found" } };
  }
  if (error instanceof RedemptionError) {
    return { status: 409, body: { error: error.message, code: error.code } };
  }
  if (error instanceof MessageQuotaError) {
    return { status: 402, body: { error: error.message, code: "quota_exceeded" } };
  }
  if (error instanceof EncryptionError) {
    // The message describes configuration, not secrets, and the owner needs it
    // to understand why connecting WhatsApp failed.
    return { status: 500, body: { error: error.message, code: "encryption_unavailable" } };
  }
  if (error instanceof DatabaseError) {
    return { status: 500, body: { error: "A database error occurred. Please try again.", code: "database_error" } };
  }
  if (error instanceof HTTPException) {
    return { status: error.status, body: { error: error.message, code: "http_error" } };
  }

  console.error("Unhandled request error", error);
  return { status: 500, body: { error: "Something went wrong. Please try again.", code: "internal_error" } };
}

/** Wraps a handler so domain errors become well-formed API responses. */
export function apiError(c: Context<AppEnv>, error: unknown) {
  const mapped = toErrorResponse(error);
  if (mapped.body.retryAfter) c.header("retry-after", String(mapped.body.retryAfter));
  return c.json(mapped.body, mapped.status as 400);
}

/** Validation failure response, keyed by field name. */
export function validationError(c: Context<AppEnv>, fields: Record<string, string>) {
  return c.json({ error: "Please check the highlighted fields", code: "validation_failed", fields }, 422);
}

/** Parses `?limit=` / `?cursor=` with sane bounds. */
export function pagination(c: Context<AppEnv>, defaultLimit = 25, maxLimit = 100) {
  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const cursor = Number.parseInt(c.req.query("cursor") ?? "", 10);
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), maxLimit) : defaultLimit,
    cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : 0
  };
}
