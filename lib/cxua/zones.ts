/**
 * c.cx.ua zone configuration
 * ==========================
 *
 * The c.cx.ua publisher panel issues per-site ad zones. Each zone has a
 * numeric ID and a fixed ad code that looks like:
 *
 *   <script src="https://c.cx.ua/ad/serve/banner/{ZONE_ID}"></script>
 *   <script src="https://c.cx.ua/ad/serve/popup/{ZONE_ID}?f={FREQ}&t={HOURS}"></script>
 *
 * The defaults here match the screenshots from the user's c.cx.ua dashboard
 * (banner zone 32 and popup zone 31 on Faucero.com). They can be overridden
 * at any time via the Vars panel without redeploying.
 *
 * Frequency params (popup only, controlled in the c.cx.ua panel):
 *   f = max popunders per t hours
 *   t = throttle window in hours
 * Per c.cx.ua's docs: "If you change ad frequency settings, the code on
 * your website updates automatically. No need to replace it." — meaning
 * once these query params are baked into your HTML, the c.cx.ua origin
 * still respects whatever frequency you set in the panel.
 */

const BANNER_ORIGIN = "https://c.cx.ua"

const DEFAULT_BANNER_ZONE = "32"
const DEFAULT_POPUP_ZONE = "31"
const DEFAULT_POPUP_PARAMS = "f=4&t=1"

/** Returns the configured banner zone id, falling back to the panel default. */
export function getBannerZoneId(): string {
  const v =
    process.env.NEXT_PUBLIC_CXUA_BANNER_ZONE_ID ||
    process.env.NEXT_PUBLIC_CCXUA_BANNER_ZONE_ID ||
    DEFAULT_BANNER_ZONE
  return String(v).trim()
}

/** Returns the configured popup zone id, falling back to the panel default. */
export function getPopupZoneId(): string {
  const v =
    process.env.NEXT_PUBLIC_CXUA_POPUP_ZONE_ID ||
    process.env.NEXT_PUBLIC_CCXUA_POPUP_ZONE_ID ||
    DEFAULT_POPUP_ZONE
  return String(v).trim()
}

/**
 * Returns the configured popup frequency query string (e.g. "f=4&t=1").
 * No leading "?". Frequency itself is enforced server-side by c.cx.ua.
 */
export function getPopupParams(): string {
  const v =
    process.env.NEXT_PUBLIC_CXUA_POPUP_PARAMS ||
    process.env.NEXT_PUBLIC_CCXUA_POPUP_PARAMS ||
    DEFAULT_POPUP_PARAMS
  return String(v).trim().replace(/^\?+/, "")
}

/** Full banner script URL — exactly as shown in the c.cx.ua panel. */
export function getBannerScriptUrl(zoneId: string = getBannerZoneId()): string {
  return `${BANNER_ORIGIN}/ad/serve/banner/${encodeURIComponent(zoneId)}`
}

/** Full popup script URL — exactly as shown in the c.cx.ua panel. */
export function getPopupScriptUrl(
  zoneId: string = getPopupZoneId(),
  params: string = getPopupParams(),
): string {
  const qs = params ? `?${params}` : ""
  return `${BANNER_ORIGIN}/ad/serve/popup/${encodeURIComponent(zoneId)}${qs}`
}

export { BANNER_ORIGIN as CXUA_ORIGIN }
