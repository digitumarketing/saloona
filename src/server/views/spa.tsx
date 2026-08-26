/**
 * Server-rendered scaffolding for the two client-rendered surfaces.
 *
 * Neither the dashboard nor the customer wallet is server-rendered — both are
 * private, neither needs to be indexed, and rendering React twice for screens
 * behind a login buys nothing. What the Worker does send is a mount point and a
 * visible placeholder, so the first paint is the brand rather than a white page
 * while the bundle downloads over a phone connection.
 */

import type { FC } from "hono/jsx";
import { brand } from "../../shared/brand.js";

/**
 * The mount point plus a first-paint placeholder.
 *
 * The spinner is inline CSS rather than a utility class because it has to animate
 * before the stylesheet is parsed, which is exactly the window it exists to
 * cover. React replaces the whole element on mount, so nothing here can go stale.
 */
export const SpaMount: FC<{ label: string }> = ({ label }) => (
  <>
    <div id="root">
      <div
        style="min-height:70vh;display:flex;align-items:center;justify-content:center;color:#0f8078"
        role="status"
        aria-label={label}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" style="animation:sln-spin 1s linear infinite">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" />
        </svg>
      </div>
    </div>
    <style dangerouslySetInnerHTML={{ __html: "@keyframes sln-spin{to{transform:rotate(360deg)}}" }} />
    <noscript>
      <div style="max-width:32rem;margin:4rem auto;padding:0 1.5rem;text-align:center;font-family:system-ui,sans-serif">
        <h1 style="font-size:1.25rem;margin:0 0 .5rem">JavaScript is switched off</h1>
        <p style="color:#3f547d;line-height:1.6;margin:0">
          {brand.productName} needs JavaScript to run. Turn it on in your browser settings and reload this page.
        </p>
      </div>
    </noscript>
  </>
);

/**
 * The offline page the customer wallet's service worker falls back to.
 *
 * Static by necessity — it is served from the cache when the network is gone, so
 * it can contain no data and must not depend on the JavaScript bundle loading.
 *
 * The retry control is a nonce'd listener rather than an `onclick` attribute: CSP
 * governs attribute handlers under `script-src-attr`, which has no nonce
 * mechanism, so allowing one would mean allowing all of them everywhere.
 */
export const OfflinePage: FC<{ nonce?: string }> = ({ nonce }) => (
  <div class="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a9 9 0 0 1 4-2.3M19 13a9 9 0 0 0-6-2.9" stroke-linecap="round" />
        <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
      </svg>
    </span>
    <h1 class="mt-5 text-xl">You are offline</h1>
    <p class="mt-2 text-sm leading-6 text-ink-500">
      Your points card needs a connection to show an up-to-date balance. It will load as soon as you are back on
      mobile data or Wi-Fi.
    </p>
    <button type="button" id="sln-retry" class="btn-primary mt-6">
      Try again
    </button>
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html:
          "document.getElementById('sln-retry').addEventListener('click',function(){window.location.reload()})"
      }}
    />
  </div>
);
