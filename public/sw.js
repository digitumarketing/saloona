/*
 * Service worker for the customer wallet.
 *
 * Scope is deliberately narrow. The wallet is the only surface a customer opens
 * from their home screen, often on a poor connection at a reception desk, so it
 * gets an offline shell. The dashboard is not cached: stale revenue figures are
 * worse than an error message, and reception staff need to know when they are
 * offline rather than silently billing into a void.
 */

const VERSION = "saloona-v1";
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/assets/app.css", "/icons/icon-192.png", "/icons/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // A single missing file must not abort the whole install, so each entry is
      // added independently.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or anything under the dashboard.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/app")) return;

  // Static build output is immutable for a given ASSET_VERSION, so it is served
  // from cache first and refreshed in the background.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Wallet pages: network first, falling back to the offline page so the
  // customer sees an explanation rather than the browser's dinosaur.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || new Response("Offline", { status: 503 }))
      )
    );
  }
});
