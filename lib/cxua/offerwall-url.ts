/**
 * c.cx.ua offerwall URL builder
 * -----------------------------
 * Per the c.cx.ua docs (https://c.cx.ua/docs):
 *
 *   https://c.cx.ua/offerwall/[API_KEY]/[USER_ID]
 *
 * That is the ONLY public endpoint c.cx.ua exposes to publishers. There is
 * no banner script and no popup-redirect script — the offerwall iframe URL
 * is the entire integration surface.
 *
 * The API key is exposed to the browser via `NEXT_PUBLIC_CCXUA_API_KEY`
 * (it's a public publisher identifier, not a secret — the secret is the
 * separate `CCXUA_SECRET_KEY` used only on the server for signature
 * verification of S2S postbacks).
 */

import { getCxUaVisitorId } from "./visitor-id"

/**
 * The public c.cx.ua API key, exposed on `window` via Next's
 * `NEXT_PUBLIC_*` env-var inlining. Empty string when not configured.
 */
export function getCxUaApiKey(): string {
  // Next inlines NEXT_PUBLIC_* at build time, so this is safe in client code.
  return (process.env.NEXT_PUBLIC_CCXUA_API_KEY || "").trim()
}

/**
 * Builds the offerwall URL for the current browser. Returns `null` when:
 *   - called server-side (no visitor id available without React state)
 *   - the public API key isn't configured
 *
 * Optional `userId` overrides the auto-generated guest id (use the
 * authenticated user's id when available).
 */
export function buildCxUaOfferwallUrl(userId?: string | null): string | null {
  if (typeof window === "undefined") return null
  const apiKey = getCxUaApiKey()
  if (!apiKey) return null

  const id = (userId && userId.trim()) || getCxUaVisitorId()
  if (!id) return null

  return `https://c.cx.ua/offerwall/${encodeURIComponent(apiKey)}/${encodeURIComponent(id)}`
}

/**
 * True when the c.cx.ua integration is configured and ready to render
 * promo surfaces. Components should short-circuit when this is false so
 * we never render an unclickable banner.
 */
export function isCxUaConfigured(): boolean {
  return getCxUaApiKey().length > 0
}
