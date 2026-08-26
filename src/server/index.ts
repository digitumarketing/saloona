/**
 * Worker entry point.
 *
 * One Hono app serves all four surfaces from one deployment:
 *
 *   /            server-rendered marketing, legal, and auth pages (indexable)
 *   /app/*       the dashboard SPA shell
 *   /j/:slug/*   the customer wallet PWA shell, QR image, and printable poster
 *   /api/*       the JSON API
 *
 * Order matters. `withSession` runs before everything so any route can ask who is
 * signed in; `csrfProtection` runs before any handler that writes. The catch-all
 * 404 is registered last, via Hono's `notFound`, so an unknown marketing URL
 * returns a real 404 instead of a 200 that teaches search engines to index typos.
 */

import { Hono } from "hono";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { apiRoutes } from "./routes/api/index.js";
import { appRoutes } from "./routes/app.js";
import { authRoutes } from "./routes/auth.js";
import { marketingRoutes, renderNotFound } from "./routes/marketing.js";
import { publicRoutes } from "./routes/public.js";
import { qrRoutes } from "./routes/qr.js";
import { seoRoutes } from "./routes/seo.js";
import { csrfProtection, withSession } from "./middleware/auth.js";
import { toErrorResponse } from "./lib/http.js";
import { runScheduled } from "./services/scheduler.js";
import type { AppEnv, Env } from "./types.js";

const app = new Hono<AppEnv>();

/**
 * Baseline security headers.
 *
 * `script-src` allows no inline JavaScript at all: every inline script the Worker
 * emits carries the per-request nonce that `NONCE` generates here and route
 * handlers read back from `c.get("secureHeadersNonce")`. That is the difference
 * between a CSP that stops a stored-XSS payload — a salon name, a customer's own
 * name, a campaign body — and one that merely looks like it does.
 *
 * `style-src` keeps `'unsafe-inline'` and cannot drop it: React's `style` prop
 * emits inline style *attributes* throughout the dashboard, and `style-src-attr`
 * has no nonce mechanism. Inline CSS cannot execute, so the exposure is layout,
 * not code.
 *
 * Meta's Graph API is called from the Worker, never the browser, so it is absent
 * from `connect-src`. Salon logos are owner-supplied URLs on arbitrary hosts,
 * which is why `img-src` has to admit `https:` wholesale.
 */
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", NONCE],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.bunny.net"],
      fontSrc: ["'self'", "https://fonts.bunny.net", "data:"],
      // Salon logos are entered as URLs by the owner and may sit on any host.
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"]
    },
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
    strictTransportSecurity: "max-age=31536000; includeSubDomains"
  })
);

/**
 * Session resolution before anything else, so both the API and the HTML routes
 * see the same answer. It is not a requirement — `requireAuth` is what enforces
 * that — only a lookup.
 */
app.use("*", withSession);
app.use("*", csrfProtection);

// The JSON API. Mounted before the HTML routes so `/api/j/:slug` cannot be
// shadowed by the wallet shell's catch-all.
app.route("/api/auth", authRoutes);
app.route("/api/j", publicRoutes);
app.route("/api", apiRoutes);

// Client-rendered surfaces and their static companions.
app.route("/", appRoutes);
app.route("/", qrRoutes);

// Sitemap, robots, and the two manifests.
app.route("/", seoRoutes);

// Marketing, legal, and auth pages last: it owns "/" and a long list of
// individual paths, none of which may swallow the routes above.
app.route("/", marketingRoutes);

app.notFound((c) => {
  // An unknown API path deserves JSON, not an HTML page a fetch() cannot read.
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: "Unknown endpoint", code: "not_found" }, 404);
  }
  return renderNotFound(c);
});

/**
 * Last-resort handler.
 *
 * Without this an unexpected throw returns Cloudflare's own error page, which
 * tells the visitor nothing and the operator less. Errors are logged with the
 * path so Workers Logs can be searched by route.
 */
app.onError((error, c) => {
  const path = new URL(c.req.url).pathname;
  console.error(`Unhandled error on ${c.req.method} ${path}`, error);

  const mapped = toErrorResponse(error);
  if (path.startsWith("/api/")) return c.json(mapped.body, mapped.status as 500);
  return c.text(mapped.body.error, mapped.status as 500);
});

export default {
  fetch: app.fetch,

  /**
   * Cron entry point — the automation engine.
   *
   * Two cadences share this handler and are told apart by the cron expression:
   * `*​/5 * * * *` drains the message queue, and the hourly run lets each
   * organization's daily jobs fire at 09:00 in its own timezone. Reports are
   * logged rather than returned; a cron invocation has nobody to answer.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduled(event.cron, env)
        .then((reports) => {
          for (const report of reports) {
            if (report.errors && report.errors.length > 0) {
              console.error(`cron ${event.cron} ${report.job}`, JSON.stringify(report));
            } else {
              console.log(`cron ${event.cron} ${report.job}`, JSON.stringify(report));
            }
          }
        })
        .catch((error: unknown) => {
          // A throw inside a cron run is invisible unless it is logged here.
          console.error(`cron ${event.cron} failed`, error);
        })
    );
  }
} satisfies ExportedHandler<Env>;
