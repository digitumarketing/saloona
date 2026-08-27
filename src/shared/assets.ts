/**
 * Static asset paths.
 *
 * Vite emits the stylesheet and SPA bundle at fixed names (configured in
 * `vite.config.ts`) rather than content-hashed ones, because the Worker cannot
 * read Vite's manifest at request time. Cache busting is therefore explicit:
 * bump `ASSET_VERSION` when shipping a change to the client bundle or CSS, and
 * the query string invalidates every cached copy.
 */

export const ASSET_VERSION = "2";

export const assets = {
  css: `/assets/app.css?v=${ASSET_VERSION}`,
  appJs: `/assets/app.js?v=${ASSET_VERSION}`,
  /** The customer wallet is a separate bundle: it must not carry the dashboard. */
  walletJs: `/assets/wallet.js?v=${ASSET_VERSION}`,
  favicon: "/icons/favicon.svg",
  appleTouchIcon: "/icons/apple-touch-icon.png",
  icon192: "/icons/icon-192.png",
  icon512: "/icons/icon-512.png",
  ogImage: "/icons/og-image.png",
  manifest: "/manifest.webmanifest",
  serviceWorker: "/sw.js"
} as const;
