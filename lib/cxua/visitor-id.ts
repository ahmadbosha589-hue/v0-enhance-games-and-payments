/**
 * c.cx.ua visitor-id helper
 * --------------------------
 * c.cx.ua's offerwall expects a stable per-user identifier in the URL path
 * (https://c.cx.ua/offerwall/[API_KEY]/[USER_ID]). For authenticated users
 * we pass their real account id. For anonymous visitors on public pages we
 * generate a stable id, persist it in a long-lived cookie + localStorage,
 * and reuse it so impressions and clicks deduplicate properly.
 *
 * Format: "guest_" + 22-char base36 random — short enough to fit in a URL
 * and varchar(32) per c.cx.ua's parameter spec.
 */

const COOKIE_NAME = "cxua_vid"
const STORAGE_KEY = "cxua_visitor_id_v1"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + escaped + "=([^;]*)"))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return
  const isHttps = typeof location !== "undefined" && location.protocol === "https:"
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "SameSite=Lax",
  ]
  if (isHttps) parts.push("Secure")
  document.cookie = parts.join("; ")
}

function generateId(): string {
  // 22 chars of base36 ~= 113 bits of entropy. Good enough for tracking.
  let id = ""
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < bytes.length; i++) {
      id += bytes[i].toString(36)
    }
  } else {
    // Fallback for very old browsers
    while (id.length < 22) id += Math.random().toString(36).slice(2)
  }
  return ("guest_" + id).slice(0, 32)
}

/**
 * Returns a stable visitor id for the current browser. Safe to call multiple
 * times — always returns the same id within a browser. Returns an empty
 * string when called server-side.
 */
export function getCxUaVisitorId(): string {
  if (typeof window === "undefined") return ""

  // 1) cookie (preferred — survives subdomain navigation)
  const fromCookie = readCookie(COOKIE_NAME)
  if (fromCookie && fromCookie.length > 0) {
    // Re-sync to localStorage for resilience
    try {
      localStorage.setItem(STORAGE_KEY, fromCookie)
    } catch {
      /* ignore quota / private-mode errors */
    }
    return fromCookie
  }

  // 2) localStorage (survives cookie clears)
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY)
    if (fromStorage && fromStorage.length > 0) {
      writeCookie(COOKIE_NAME, fromStorage, COOKIE_MAX_AGE_SECONDS)
      return fromStorage
    }
  } catch {
    /* ignore */
  }

  // 3) generate a new one
  const fresh = generateId()
  writeCookie(COOKIE_NAME, fresh, COOKIE_MAX_AGE_SECONDS)
  try {
    localStorage.setItem(STORAGE_KEY, fresh)
  } catch {
    /* ignore */
  }
  return fresh
}
