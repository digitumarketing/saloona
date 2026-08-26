/**
 * QR code and printable poster.
 *
 * The whole customer journey begins with a code on the reception desk, so this is
 * served by the Worker rather than drawn in the dashboard: an `<img>` URL can be
 * printed, pasted into WhatsApp, emailed to a signwriter, and cached at the edge.
 * A canvas rendered in the browser can do none of those things.
 *
 * The poster is deliberately a plain print stylesheet rather than a PDF library —
 * every phone and desktop browser can already produce a PDF from a print dialog.
 */

import { Hono } from "hono";
import { PlatformDb } from "../lib/db.js";
import { qrSvg } from "../../shared/qr.js";
import { assets } from "../../shared/assets.js";
import { brand } from "../../shared/brand.js";
import { baseUrl } from "../lib/url.js";
import type { AppEnv } from "../types.js";

export const qrRoutes = new Hono<AppEnv>();

interface PosterOrg {
  name: string;
  slug: string;
  city: string | null;
}

async function findOrg(env: AppEnv["Bindings"], slug: string): Promise<PosterOrg | null> {
  return new PlatformDb(env.DB).first<PosterOrg>(
    `select o.name, o.slug,
            (select l.city from locations l where l.organization_id = o.id order by l.created_at limit 1) as city
     from organizations o
     where o.slug = ? and o.suspended_at is null`,
    [slug]
  );
}

/**
 * The scannable code itself.
 *
 * Cached for a day: the target URL only changes if the salon changes its slug,
 * and a stale code for a few hours is far less harmful than an uncacheable image
 * on a poster that gets loaded from a print preview repeatedly.
 */
qrRoutes.get("/j/:slug/qr.svg", async (c) => {
  const slug = c.req.param("slug");
  const org = await findOrg(c.env, slug);
  if (!org) return c.text("Not found", 404);

  const size = clamp(Number.parseInt(c.req.query("size") ?? "480", 10), 120, 2000, 480);
  const { svg } = qrSvg(`${baseUrl(c)}/j/${org.slug}`, { size });

  c.header("content-type", "image/svg+xml; charset=utf-8");
  c.header("cache-control", "public, max-age=3600, s-maxage=86400");
  return c.body(svg);
});

/**
 * A ready-to-print A5 card for the reception desk.
 *
 * Bilingual on purpose: in most Pakistani salons the person holding the phone
 * reads the Urdu line first, and a poster nobody understands gets no scans.
 */
qrRoutes.get("/j/:slug/poster", async (c) => {
  const slug = c.req.param("slug");
  const org = await findOrg(c.env, slug);
  if (!org) return c.text("Not found", 404);

  const joinUrl = `${baseUrl(c)}/j/${org.slug}`;
  const { svg } = qrSvg(joinUrl, { size: 620, foreground: "#0b1b2b" });
  // Empty rather than "undefined" if the header middleware ever fails to run: an
  // unmatched nonce blocks the script, which loses the button but not the poster.
  const nonce = c.get("secureHeadersNonce") ?? "";

  c.header("cache-control", "private, no-store");
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Rewards card — ${escapeHtml(org.name)}</title>
<link rel="icon" href="${assets.favicon}">
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, "Segoe UI", system-ui, sans-serif;
    color: #0b1b2b;
    background: #eef2f5;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 460px;
    background: #fff;
    border-radius: 24px;
    padding: 36px 32px 28px;
    text-align: center;
    box-shadow: 0 18px 48px rgba(11, 27, 43, 0.14);
  }
  .eyebrow { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #0f8078; font-weight: 700; margin: 0; }
  h1 { font-size: 30px; line-height: 1.15; margin: 10px 0 6px; letter-spacing: -0.02em; }
  .city { margin: 0; color: #64748b; font-size: 14px; }
  .qr { margin: 24px auto 18px; width: 260px; height: 260px; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .lead { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
  .urdu { font-family: "Noto Nastaliq Urdu", serif; font-size: 17px; line-height: 2.1; margin: 0 0 14px; direction: rtl; color: #334155; }
  ol { text-align: left; margin: 0 auto 18px; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #475569; max-width: 320px; }
  .url { font-size: 12px; color: #64748b; word-break: break-all; margin: 0; }
  .footer { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
  .print { position: fixed; top: 16px; right: 16px; }
  .print button {
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    background: #0f8078; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px;
  }
  @media print {
    body { background: #fff; padding: 0; min-height: auto; }
    .card { box-shadow: none; max-width: none; border-radius: 0; padding: 0; }
    .print { display: none; }
  }
</style>
</head>
<body>
  <div class="print"><button type="button" id="print">Print this card</button></div>
  <div class="card">
    <p class="eyebrow">Rewards card</p>
    <h1>${escapeHtml(org.name)}</h1>
    ${org.city ? `<p class="city">${escapeHtml(org.city)}</p>` : ""}
    <div class="qr">${svg}</div>
    <p class="lead">Scan to collect points on every visit</p>
    <p class="urdu">ہر وزٹ پر پوائنٹس جمع کریں — کوڈ اسکین کریں</p>
    <ol>
      <li>Open your phone camera and point it at the code.</li>
      <li>Enter your name and mobile number — that is all.</li>
      <li>Your points card lives on your phone. No app to install.</li>
    </ol>
    <p class="url">${escapeHtml(joinUrl)}</p>
    <p class="footer">Powered by ${brand.productName} · ${escapeHtml(hostOf(baseUrl(c)))}</p>
  </div>
  <script nonce="${nonce}">document.getElementById('print').addEventListener('click',function(){window.print()})</script>
</body>
</html>`);
});

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** The bare host, so the poster footer reads "saloona.pk" not a full URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
