/**
 * One canonical host.
 *
 * Both `saloona.shop` and `www.saloona.shop` are attached to the Worker as
 * custom domains, so that a visitor who types either reaches the product rather
 * than a DNS error. Serving both is not the same as answering on both: two
 * hostnames returning 200 for identical pages is duplicate content, and it
 * splits whatever ranking the site earns.
 *
 * The redirect is the first middleware in the stack, which is the part worth
 * testing — a later refactor that moves it below `withSession` or
 * `csrfProtection` would still redirect GETs while quietly changing what
 * happens to everything else.
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("canonical host", () => {
  it("redirects www to the apex, preserving path and query", async () => {
    const response = await SELF.fetch("https://www.saloona.shop/pricing?plan=growth", {
      redirect: "manual"
    });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://saloona.shop/pricing?plan=growth");
  });

  it("leaves the apex alone", async () => {
    const response = await SELF.fetch("https://saloona.shop/pricing", { redirect: "manual" });
    expect(response.status).toBe(200);
  });

  it("leaves the workers.dev fallback serving", async () => {
    // Deliberately not redirected: it is the way back in when the custom domain
    // itself is misconfigured, and canonical tags already point at BASE_URL
    // whatever host the request arrived on.
    const response = await SELF.fetch("https://saloona-saas.roshaanraza3.workers.dev/pricing", {
      redirect: "manual"
    });
    expect(response.status).toBe(200);
  });

  it("redirects before authentication or CSRF run", async () => {
    // A POST to www with no origin header would be rejected by csrfProtection
    // with a 403 if it reached it. Getting a 301 instead proves the redirect
    // sits above that middleware, which is where it belongs: there is no reason
    // to resolve a session for a response whose whole body is a Location header.
    const response = await SELF.fetch("https://www.saloona.shop/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@example.test", password: "whatever" }),
      redirect: "manual"
    });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://saloona.shop/api/auth/login");
  });
});
