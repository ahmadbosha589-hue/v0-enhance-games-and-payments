"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Megaphone } from "lucide-react"
import {
  getBannerScriptUrl,
  getBannerZoneId,
  getPopupParams,
  getPopupScriptUrl,
  getPopupZoneId,
  CXUA_ORIGIN,
} from "@/lib/cxua/zones"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"

/**
 * c.cx.ua integration — using the REAL ad-serving endpoints from the
 * publisher panel:
 *
 *   Banner: <script src="https://c.cx.ua/ad/serve/banner/{zone}"></script>
 *   Popup : <script src="https://c.cx.ua/ad/serve/popup/{zone}?f=4&t=1"></script>
 *
 * Why the banner MUST run inside an iframe
 * ----------------------------------------
 * The banner serve endpoint responds with a script whose entire body is a
 * single `document.write(...)` call:
 *
 *   document.write('<a href="https://c.cx.ua/ad/click/54/32" ...>
 *                     <img src="...png" width="728" height="90" .../></a>');
 *
 * `document.write()` only injects content while the document is still being
 * parsed. If you create the <script> dynamically and append it AFTER the
 * page has loaded (the previous implementation), the browser SILENTLY
 * IGNORES the write — so the creative never appears and you get an empty
 * (black) reserved box. That was the bug.
 *
 * The fix: host the official one-line embed in a SAME-ORIGIN static frame
 * (public/ads/cxua/banner-frame.html). Being a real document on our origin,
 * (a) `document.write` executes during its parse, and (b) the browser sends
 * the faucero.com referrer that c.cx.ua REQUIRES — it returns an empty
 * response otherwise. A sandboxed/srcdoc frame can satisfy neither, which is
 * why earlier attempts rendered nothing. The frame reports its measured size
 * back via postMessage so the banner stays responsive.
 *
 * Security: the iframe is sandboxed with only "allow-scripts allow-popups
 * allow-popups-to-escape-sandbox" — no allow-same-origin — so the ad
 * script runs in an opaque origin with zero access to our cookies/DOM,
 * while click-through (target=_blank) still works.
 *
 * Referrer: c.cx.ua validates the serve-request referrer against the
 * registered site and returns an EMPTY response without one. A sandboxed
 * srcdoc iframe strips the referrer for cross-origin subresources under the
 * default policy, so the iframe sets referrerPolicy="origin" to send the
 * site origin explicitly.
 */

// IAB standard leaderboard — matches the size configured in the c.cx.ua
// publisher panel for Faucero zone 32. The container reserves this much
// vertical space so layout doesn't shift when the creative loads.
const DEFAULT_BANNER_WIDTH = 728
const DEFAULT_BANNER_HEIGHT = 90

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

interface CxUaBannerProps {
  className?: string
  showLabel?: boolean
  /** Override the configured zone id (defaults to env / panel default). */
  zoneId?: string
  /**
   * Optional visual chrome:
   *   - "default" : centered with a small "Sponsored" label above
   *   - "compact" : no chrome (just the ad)
   *   - "card"    : wrapped in a soft card
   *   - "slim"    : minimal chrome, floating "Sponsored" pill
   */
  variant?: "default" | "compact" | "card" | "slim"
  /** No-op, kept for API compatibility with older callers. */
  userId?: string | null
  /**
   * The creative's natural width in pixels. Defaults to 728 (matches the
   * panel-configured zone size).
   */
  width?: number
  /**
   * The creative's natural height in pixels. Defaults to 90.
   */
  height?: number
  /**
   * Maximum width the wrapper is allowed to occupy. Defaults to the
   * creative's natural width.
   */
  maxWidth?: number
  /**
   * Fires whenever the "is there really a creative on screen" state
   * changes: `true` once a real ad has been measured and is rendering,
   * `false` while loading, once confirmed empty (no campaign / blocked),
   * or hidden for Do-Not-Track.
   *
   * A caller that wraps this component in its own chrome (border, a
   * "Sponsored" label, a dismiss button, etc.) should use this to decide
   * whether to show that chrome at all — otherwise an empty ad response
   * leaves the caller's chrome rendered around nothing, which looks like a
   * collapsed sliver instead of just not showing up.
   */
  onVisibilityChange?: (visible: boolean) => void
}

/**
 * CxUaBanner — renders the configured c.cx.ua banner zone (default
 * 728×90) by injecting the panel-provided serve <script> directly into
 * a mount-point div. The wrapper reserves the creative's natural
 * height so layout is stable.
 */
export function CxUaBanner({
  className,
  showLabel = true,
  zoneId,
  variant = "default",
  width = DEFAULT_BANNER_WIDTH,
  height = DEFAULT_BANNER_HEIGHT,
  maxWidth,
  onVisibilityChange,
}: CxUaBannerProps) {
  const hasMarketingConsent = useAdConsent()
  const [zone] = useState<string>(zoneId || getBannerZoneId())
  // Unique token so the iframe's height postMessage can be matched to THIS
  // instance even when several banners share the same zone on one page.
  const [token] = useState<string>(() => Math.random().toString(36).slice(2))
  const [mounted, setMounted] = useState(false)
  const [dnt, setDnt] = useState(false)
  // The creative's INTRINSIC size, reported back from inside the iframe.
  //
  // This must be the natural (unconstrained) size — NOT the rendered
  // bounding box. The iframe is already width-constrained by its parent,
  // so measuring the rendered box and then feeding that back as the
  // wrapper's max-width creates a shrink feedback loop that ratchets the
  // banner narrower on every report. We only ever use these numbers to
  // derive an aspect ratio and an upper size bound.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  // c.cx.ua returns an EMPTY 200 when it has no campaign for this
  // domain/zone (e.g. referrer not matching the registered site, or no
  // active campaigns). When the iframe's final check finds no creative we
  // collapse the whole banner instead of showing an empty white box — BUT
  // only if we never measured a real creative. Once something has rendered,
  // a subsequent empty verdict (rotation gap between campaigns) must NOT
  // unmount the banner: that unmount-remount cycle is exactly the
  // "Sponsored appears then disappears" flash on the landing page.
  const [empty, setEmpty] = useState(false)
  const everMeasuredRef = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    setMounted(true)
    const isDnt =
      navigator.doNotTrack === "1" ||
      // @ts-expect-error legacy IE
      window.doNotTrack === "1" ||
      // @ts-expect-error Safari
      navigator.msDoNotTrack === "1"
    setDnt(isDnt)
  }, [])

  // Listen for the size / emptiness report posted by the iframe document.
  useEffect(() => {
    if (!mounted || !hasMarketingConsent || dnt) return
    function onMessage(e: MessageEvent) {
      const data = e.data
      if (!data || typeof data !== "object") return
      if (data.__cxuaBanner !== true || data.token !== token) return
      if ((data as { debug?: boolean }).debug === true) {
        // Temporary diagnostics — remove after banner investigation.
        if (typeof window !== "undefined") {
          (window as unknown as { __cxuaDebug?: string[] }).__cxuaDebug =
            (window as unknown as { __cxuaDebug?: string[] }).__cxuaDebug || []
          ;(window as unknown as { __cxuaDebug?: string[] }).__cxuaDebug!.push(String((data as { msg?: unknown }).msg))
        }
        return
      }
      if (data.empty === true) {
        // Final verdict from the iframe: no creative served THIS load.
        // Collapse only if we have never seen one — otherwise keep the last
        // known-good banner instead of flashing away mid-session.
        if (!everMeasuredRef.current) setEmpty(true)
        return
      }
      const h = Number(data.height)
      const w = Number(data.width)
      if (Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0) {
        setEmpty(false)
        everMeasuredRef.current = true
        setNatural({ width: Math.round(w), height: Math.round(h) })
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [mounted, hasMarketingConsent, dnt, token])

  // Let the caller know whether there's actually a creative on screen.
  // "Visible" means we've mounted, aren't hidden for Do-Not-Track, haven't
  // been told the slot is empty, AND have a real measurement in hand — not
  // just "haven't been rejected yet" (which is also true during the initial
  // loading window, before we know either way).
  useEffect(() => {
    const visible = mounted && hasMarketingConsent && !dnt && !empty && natural !== null
    onVisibilityChange?.(visible)
  }, [mounted, hasMarketingConsent, dnt, empty, natural, onVisibilityChange])

  const wrapperCls = cn(
    "relative",
    variant === "card" && "rounded-lg border bg-card p-2 shadow-sm",
    "flex w-full flex-col items-center",
    className,
  )

  // Size the frame by ASPECT RATIO rather than a fixed pixel height.
  //
  // c.cx.ua rotates several formats (728×90, 468×60, 300×250 …), and the
  // slot is often narrower than the creative's natural width (a 728px
  // leaderboard inside a 768px viewport, minus page padding). Pinning the
  // height to 90px while the width shrinks is what produced the
  // letterboxed banner with a big empty gap: the creative scaled down but
  // the box didn't.
  //
  // Instead we cap the width at the creative's natural width (never
  // upscale) and let `aspect-ratio` derive the height from whatever width
  // is actually available. Before the first measurement we use the
  // default 728×90 ratio so there's no layout shift when it arrives.
  const naturalWidth = natural?.width ?? width
  const naturalHeight = natural?.height ?? height
  const frameMaxWidth = Math.min(naturalWidth, maxWidth ?? Number.POSITIVE_INFINITY)
  const aspectRatio = `${naturalWidth} / ${naturalHeight}`

  // Nothing was served (unregistered referrer domain, no active campaign,
  // or DNT). Render nothing at all — an empty "Sponsored" box is worse
  // than no box.
  if (!hasMarketingConsent || empty || (mounted && dnt)) {
    return null
  }

  return (
    <div
      className={wrapperCls}
      data-ad-network="cx-ua"
      data-ad-zone={zone}
      data-ad-type="banner"
    >
      {showLabel && natural !== null && variant !== "slim" && variant !== "compact" && (
        <div className="mb-1.5 flex w-full items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Megaphone className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Sponsored
            </span>
          </div>
        </div>
      )}

      {showLabel && variant === "slim" && (
        <span className="pointer-events-none absolute -top-2 left-3 z-10 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          Sponsored
        </span>
      )}

      {/* The creative lives in our same-origin static frame
          (public/ads/cxua/banner-frame.html) which hosts the official embed.
          See the file header for why srcdoc/sandboxed frames cannot work:
          c.cx.ua refuses requests without a faucero.com referrer. */}
      <div
        className="w-full flex items-center justify-center"
        style={{ maxWidth: frameMaxWidth }}
        aria-label="Sponsored content"
      >
        {mounted ? (
          <iframe
            ref={iframeRef}
            title="Sponsored content"
            src={`/ads/cxua/banner-frame.html?z=${encodeURIComponent(zone)}&t=${token}`}
            // Same-origin static frame (see public/ads/cxua/banner-frame.html):
            // c.cx.ua refuses to serve without a faucero.com referrer, which a
            // sandboxed/srcdoc frame cannot provide. The frame contains only
            // the official one-line embed. Click-through opens a new tab via
            // the creative's own target=_blank.
            scrolling="no"
            loading="lazy"
            referrerPolicy="origin"
            className="w-full border-0 block"
            style={{
              // Width comes from the parent (w-full, capped at the
              // creative's natural width); height follows the ratio.
              maxWidth: frameMaxWidth,
              aspectRatio,
              height: "auto",
              backgroundColor: "transparent",
              colorScheme: "normal",
            }}
          />
        ) : (
          // Reserve the same ratio pre-mount to avoid layout shift.
          <div style={{ width: "100%", maxWidth: frameMaxWidth, aspectRatio }} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Popunder loader
// ---------------------------------------------------------------------------

interface CxUaPopupLoaderProps {
  /** Override the configured popup zone id. */
  zoneId?: string
  /** Override the configured frequency query string (e.g. "f=4&t=1"). */
  params?: string
  /** No-op, kept for API compatibility with older callers. */
  userId?: string | null
  /** No-op, kept for API compatibility with older callers. */
  throttleHours?: number
}

/**
 * Marker we put on the script tag so we never inject it twice (HMR, React
 * strict-mode double-mount, navigation re-renders, etc.).
 */
const POPUP_MARKER_ATTR = "data-cxua-popup"

/**
 * CxUaPopupLoader — injects the real c.cx.ua popunder script directly into
 * `document.body`, exactly as the panel instructs ("place before
 * </body>"). The script self-throttles based on the `f` and `t` query
 * params set in the c.cx.ua publisher panel.
 */
export function CxUaPopupLoader({
  zoneId,
  params,
}: CxUaPopupLoaderProps = {}) {
  const hasMarketingConsent = useAdConsent()

  useEffect(() => {
    if (!hasMarketingConsent) return
    if (typeof window === "undefined") return
    if (typeof document === "undefined") return

    const zone = (zoneId || getPopupZoneId()).trim()
    if (!zone) return

    // Respect Do-Not-Track.
    const dnt =
      navigator.doNotTrack === "1" ||
      // @ts-expect-error legacy IE
      window.doNotTrack === "1" ||
      // @ts-expect-error Safari
      navigator.msDoNotTrack === "1"
    if (dnt) return

    // Idempotent: bail if the script is already on the page.
    const existing = document.querySelector(
      `script[${POPUP_MARKER_ATTR}="${zone}"]`,
    )
    if (existing) return

    // Reputation guard: the t=1 panel mode redirects the CURRENT tab to the
    // ad offer — behavior that reputation scanners (GridinSoft et al.)
    // classify as a browser hijacker and that tanks the domain's trust
    // score. Same-tab redirects are therefore hard-disabled at the component
    // level; only new-tab popunder modes are allowed through.
    const effectiveParams = params || getPopupParams()
    if (/(^|&)t=1(&|$)/.test(effectiveParams)) {
      console.warn("[cxua] popup zone uses same-tab redirect mode (t=1); refused to load")
      return
    }
    const src = getPopupScriptUrl(zone, effectiveParams)

    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.setAttribute(POPUP_MARKER_ATTR, zone)
    s.setAttribute("fetchpriority", "low")
    s.referrerPolicy = "no-referrer-when-downgrade"

    s.onerror = () => {
      s.remove()
    }

    document.body.appendChild(s)

    // NOTE: we deliberately DO NOT remove the script on unmount. The
    // popunder script installs document-level event listeners on first
    // load; removing the <script> tag wouldn't remove those listeners
    // anyway, and re-adding the script would create duplicate handlers.
  }, [hasMarketingConsent, zoneId, params])

  return null
}

// ---------------------------------------------------------------------------
// Preconnect hint (perf optimization)
// ---------------------------------------------------------------------------

/**
 * Drop this in the root layout's `<head>` to warm the TLS handshake to
 * c.cx.ua before the iframe / popup script actually requests anything.
 */
export function CxUaPreconnect() {
  return (
    <>
      <link rel="preconnect" href={CXUA_ORIGIN} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={CXUA_ORIGIN} />
    </>
  )
}