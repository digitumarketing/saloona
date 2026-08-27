/**
 * Test client.
 *
 * Requests go through `SELF.fetch`, which runs the deployed Worker — router,
 * middleware, CSP, CSRF and all — rather than calling handlers directly. Tenant
 * isolation is a property of that whole stack, so testing anything less than the
 * whole stack would test the wrong thing.
 */

import { SELF } from "cloudflare:test";

/** Must match the request origin, or `csrfProtection` rejects every write. */
export const ORIGIN = "http://localhost";

/**
 * A distinct client address per tenant.
 *
 * Signup is capped at 5 attempts per hour per IP, and this suite registers ten
 * salons. Sharing one address makes the sixth signup fail with a 429 — the
 * limiter working exactly as designed, reported as a test failure. Real salons
 * sign up from their own connections, so the harness should too. 203.0.113.0/24
 * is the RFC 5737 documentation range and routes nowhere.
 */
export function ipForTenant(index: number): string {
  return `203.0.113.${(index % 250) + 1}`;
}

export interface Client {
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
  patch(path: string, body?: unknown): Promise<Response>;
  del(path: string): Promise<Response>;
}

export function client(cookie?: string, ip = "203.0.113.254"): Client {
  const send = (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { origin: ORIGIN, "cf-connecting-ip": ip };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    return SELF.fetch(`${ORIGIN}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual"
    });
  };

  return {
    get: (path) => send("GET", path),
    post: (path, body) => send("POST", path, body),
    patch: (path, body) => send("PATCH", path, body),
    del: (path) => send("DELETE", path)
  };
}

/**
 * Asserts a successful response and returns its JSON.
 *
 * The failure message includes the body, because "expected 201, got 422" without
 * the validation errors turns a five-second fix into a debugging session.
 */
export async function ok<T = Record<string, unknown>>(response: Promise<Response> | Response): Promise<T> {
  const resolved = await response;
  const text = await resolved.text();
  if (!resolved.ok) {
    throw new Error(`Expected success, got ${resolved.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

export interface Tenant extends Client {
  cookie: string;
  slug: string;
  organizationId: string;
}

/**
 * Registers a salon and returns a client authenticated as its owner.
 *
 * `index` keeps the email and phone unique — phone is customer identity in this
 * product, and two tenants sharing one owner number would make the isolation
 * assertions ambiguous. It also picks the client address, so each salon signs up
 * from its own connection and the signup rate limit stays untouched.
 */
export async function signUpTenant(index: number, planId = "growth"): Promise<Tenant> {
  const ip = ipForTenant(index);
  const anonymous = client(undefined, ip);
  const response = await anonymous.post("/api/auth/signup", {
    businessName: `Test Salon ${index}`,
    ownerName: `Owner ${index}`,
    email: `owner${index}@example.test`,
    phone: `03001234${String(index).padStart(3, "0")}`,
    password: "a-long-enough-test-password",
    planId,
    city: "Lahore"
  });

  if (response.status !== 201) {
    throw new Error(`Signup ${index} failed with ${response.status}: ${await response.text()}`);
  }

  const cookie = sessionCookie(response);
  const authenticated = client(cookie, ip);
  const bootstrap = await ok<{ organization: { id: string; slug: string } }>(authenticated.get("/api/bootstrap"));

  return {
    ...authenticated,
    cookie,
    slug: bootstrap.organization.slug,
    organizationId: bootstrap.organization.id
  };
}

function sessionCookie(response: Response): string {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("sln_session="));
  if (!header) throw new Error("Signup returned no session cookie");
  return header.split(";")[0]!;
}
