/**
 * Canonical URL helpers.
 *
 * The deployed BASE_URL carried a trailing slash, which produced `//features`
 * links in the sitemap. Normalising in one place removes the whole class of bug.
 */

import type { Context } from "hono";
import { brand } from "../../shared/brand.js";
import type { AppEnv } from "../types.js";

export function normalizeBase(value: string | undefined | null): string {
  if (!value) return brand.baseUrl;
  return value.replace(/\/+$/, "");
}

/**
 * The origin to use when building absolute URLs. Prefers the request's own
 * origin in development and preview deployments so emailed links actually work,
 * and the configured BASE_URL in production so canonicals stay stable across
 * the workers.dev and custom-domain hostnames.
 */
export function baseUrl(c: Context<AppEnv>): string {
  const configured = normalizeBase(c.env.BASE_URL);
  const requestOrigin = new URL(c.req.url).origin;
  if (c.env.APP_ENV === "production") return configured;
  return requestOrigin;
}

export function absoluteUrl(c: Context<AppEnv>, path: string): string {
  return `${baseUrl(c)}${path.startsWith("/") ? path : `/${path}`}`;
}
