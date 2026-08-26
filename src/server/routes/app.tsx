/**
 * HTML entry points for the two client-rendered surfaces.
 *
 * Both are catch-alls: the Worker returns the same shell for every path under
 * `/app` and every path under `/j/:slug`, and the client router decides what to
 * render. That is what makes a deep link — a customer opened from a WhatsApp
 * message, a bookmarked report — survive a page refresh.
 *
 * Neither surface is indexable and neither is cacheable. `/app` in particular
 * carries a session cookie decision (redirect to login or not), and a cached
 * redirect is how one person's session lands on someone else's screen.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { Shell } from "../views/layout.js";
import { OfflinePage, SpaMount } from "../views/spa.js";
import { withSession } from "../middleware/auth.js";
import { PlatformDb } from "../lib/db.js";
import { baseUrl } from "../lib/url.js";
import { assets } from "../../shared/assets.js";
import { brand } from "../../shared/brand.js";
import type { AppEnv } from "../types.js";

export const appRoutes = new Hono<AppEnv>();

const NO_STORE = "private, no-store";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

appRoutes.use("/app", withSession);
appRoutes.use("/app/*", withSession);

/**
 * The dashboard shell.
 *
 * An unauthenticated visitor is sent to sign in with `next` set, so that after
 * signing in they land on the screen they were trying to reach rather than on the
 * dashboard home. A suspended workspace is bounced to the marketing site: there
 * is nothing in the app for it to show, and the SPA would only render an error.
 */
const dashboardShell = (c: Context<AppEnv>) => {
  const session = c.get("session");
  const url = new URL(c.req.url);

  if (!session) {
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }
  if (session.organization.suspendedAt) {
    return c.redirect("/support?workspace=suspended", 302);
  }

  c.header("cache-control", NO_STORE);
  return c.html(
    <Shell
      origin={baseUrl(c)}
      title="Dashboard"
      description={`Manage ${session.organization.name} on ${brand.productName}.`}
      path={url.pathname}
      noindex
      chrome="bare"
      moduleScript={assets.appJs}
    >
      <SpaMount label="Loading your workspace" />
    </Shell>
  );
};

appRoutes.get("/app", dashboardShell);
appRoutes.get("/app/*", dashboardShell);

// ---------------------------------------------------------------------------
// Customer wallet
// ---------------------------------------------------------------------------

/**
 * The wallet shell.
 *
 * The salon is looked up here for one reason only: so the page has the right
 * title and the right manifest before any JavaScript runs. A customer adding this
 * to their home screen should get the salon's name under the icon — they are
 * keeping a loyalty card for a salon, not installing software from Digitum. An
 * unknown slug returns 404 rather than an empty shell, because a mistyped or
 * retired code should say so.
 */
const walletShell = async (c: Context<AppEnv>) => {
  const slug = c.req.param("slug") ?? "";
  const org = await new PlatformDb(c.env.DB).first<{ name: string }>(
    "select name from organizations where slug = ? and suspended_at is null",
    [slug]
  );

  const url = new URL(c.req.url);
  c.header("cache-control", NO_STORE);

  return c.html(
    <Shell
      origin={baseUrl(c)}
      title={org ? `${org.name} rewards` : "Rewards card"}
      description={
        org
          ? `Your points, rewards and visit history at ${org.name}.`
          : "This rewards code is not active. Ask at reception for a new one."
      }
      path={url.pathname}
      noindex
      chrome="bare"
      pwa
      manifest={`/j/${encodeURIComponent(slug)}/manifest.webmanifest`}
      moduleScript={assets.walletJs}
      nonce={c.get("secureHeadersNonce")}
    >
      <SpaMount label="Loading your points" />
    </Shell>,
    org ? 200 : 404
  );
};

appRoutes.get("/j/:slug", walletShell);
appRoutes.get("/j/:slug/wallet", walletShell);

/**
 * The offline fallback precached by `public/sw.js`.
 *
 * `no-store` looks wrong on a page whose entire purpose is to be available
 * offline, and is not: Cache Storage is not the HTTP cache, so the service worker
 * keeps its copy regardless. What it does buy is a fresh CSP nonce on every
 * fetch, instead of one shared by every visitor for an hour.
 */
appRoutes.get("/offline", (c) => {
  const nonce = c.get("secureHeadersNonce");
  c.header("cache-control", NO_STORE);
  return c.html(
    <Shell
      origin={baseUrl(c)}
      title="Offline"
      description="You are offline."
      path="/offline"
      noindex
      chrome="bare"
      nonce={nonce}
    >
      <OfflinePage nonce={nonce} />
    </Shell>
  );
});
