/**
 * SEO and PWA endpoints: sitemap, robots, and web app manifests.
 *
 * Served from the Worker rather than as static files because every URL inside
 * them has to be absolute and correct for the origin actually being served —
 * the previous build hard-coded a base URL with a trailing slash and emitted
 * `//features`, which search engines treat as a different page.
 */

import { Hono } from "hono";
import { PlatformDb } from "../lib/db.js";
import { baseUrl } from "../lib/url.js";
import { brand } from "../../shared/brand.js";
import { assets } from "../../shared/assets.js";
import type { AppEnv } from "../types.js";

export const seoRoutes = new Hono<AppEnv>();

/**
 * Date of the last substantive content change, in ISO form.
 *
 * Hand-maintained on purpose. A `lastmod` that moves on every deploy trains
 * crawlers to ignore the field; one that never moves is equally useless.
 */
const CONTENT_UPDATED = "2026-08-26";

interface SitemapEntry {
  path: string;
  priority: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
}

const SITEMAP: readonly SitemapEntry[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/features", priority: "0.9", changefreq: "monthly" },
  { path: "/pricing", priority: "0.9", changefreq: "monthly" },
  { path: "/how-it-works", priority: "0.8", changefreq: "monthly" },
  { path: "/whatsapp", priority: "0.8", changefreq: "monthly" },
  { path: "/faq", priority: "0.7", changefreq: "monthly" },
  { path: "/signup", priority: "0.7", changefreq: "yearly" },
  { path: "/about", priority: "0.5", changefreq: "yearly" },
  { path: "/contact", priority: "0.5", changefreq: "yearly" },
  { path: "/support", priority: "0.5", changefreq: "monthly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/refund-policy", priority: "0.3", changefreq: "yearly" },
  { path: "/data-processing", priority: "0.3", changefreq: "yearly" }
];

seoRoutes.get("/sitemap.xml", (c) => {
  const origin = baseUrl(c);
  const urls = SITEMAP.map(
    (entry) =>
      `  <url>\n` +
      `    <loc>${origin}${entry.path === "/" ? "/" : entry.path}</loc>\n` +
      `    <lastmod>${CONTENT_UPDATED}</lastmod>\n` +
      `    <changefreq>${entry.changefreq}</changefreq>\n` +
      `    <priority>${entry.priority}</priority>\n` +
      `  </url>`
  ).join("\n");

  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 200, {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600, s-maxage=86400"
  });
});

/**
 * Crawlers are kept out of the dashboard, the API, and the customer wallet.
 *
 * `/j/` is disallowed because a customer's points wallet is reached by a token in
 * a link; there is nothing there for a search engine and everything to lose if a
 * shared link gets indexed.
 */
seoRoutes.get("/robots.txt", (c) => {
  const origin = baseUrl(c);
  const indexable = c.env.APP_ENV === "production";

  const body = indexable
    ? [
        "User-agent: *",
        "Allow: /",
        "Disallow: /app",
        "Disallow: /api/",
        "Disallow: /j/",
        "Disallow: /login",
        "Disallow: /forgot-password",
        "Disallow: /reset-password",
        "Disallow: /verify-email",
        "",
        `Sitemap: ${origin}/sitemap.xml`,
        ""
      ].join("\n")
    : // Preview and development deployments must never be indexed, or they end
      // up competing with the real site for its own keywords.
      ["User-agent: *", "Disallow: /", ""].join("\n");

  return c.body(body, 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=3600"
  });
});

/** The platform manifest, used when an owner installs the dashboard. */
seoRoutes.get("/manifest.webmanifest", (c) =>
  c.json(
    {
      name: `${brand.productName} — Salon dashboard`,
      short_name: brand.productName,
      description: brand.description,
      start_url: "/app",
      scope: "/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#ffffff",
      theme_color: brand.colors.teal,
      lang: "en",
      dir: "ltr",
      categories: ["business", "productivity"],
      icons: manifestIcons()
    },
    200,
    {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  )
);

/**
 * Per-salon manifest for the customer wallet.
 *
 * A customer who adds the wallet to their home screen should see the salon's
 * name under the icon, not ours — they are keeping a loyalty card for Glow
 * Salon, not installing software from Digitum.
 */
seoRoutes.get("/j/:slug/manifest.webmanifest", async (c) => {
  const slug = c.req.param("slug");
  const org = await new PlatformDb(c.env.DB).first<{ name: string }>(
    "select name from organizations where slug = ? and suspended_at is null",
    [slug]
  );
  if (!org) return c.json({ error: "Not found" }, 404);

  return c.json(
    {
      name: `${org.name} — Rewards`,
      short_name: org.name.slice(0, 12),
      description: `Your points, rewards and visit history at ${org.name}.`,
      start_url: `/j/${slug}/wallet`,
      scope: `/j/${slug}/`,
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#ffffff",
      theme_color: brand.colors.teal,
      lang: "en",
      dir: "ltr",
      icons: manifestIcons()
    },
    200,
    {
      "content-type": "application/manifest+json; charset=utf-8",
      // Short cache: the salon can rename itself, and the manifest is fetched
      // rarely enough that a minute of staleness costs nothing.
      "cache-control": "public, max-age=300"
    }
  );
});

function manifestIcons() {
  return [
    { src: assets.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: assets.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ];
}
