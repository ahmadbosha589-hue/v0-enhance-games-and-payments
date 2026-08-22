// Faucero service worker — minimal, no dependencies.
// Registered by components/pwa/pwa-provider.tsx.
const CACHE_VERSION = "faucero-v1"
const STATIC_CACHE = `${CACHE_VERSION}-static`
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .catch(() => {}) // offline page is best-effort; never block install
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache API traffic — balances and rewards must always be fresh.
  if (url.pathname.startsWith("/api/")) return

  // App navigations: network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || caches.match(OFFLINE_URL) || Response.error()
        })
    )
    return
  }

  // Static build assets: cache-first (content-hashed URLs).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
            return response
          })
      )
    )
  }
})
