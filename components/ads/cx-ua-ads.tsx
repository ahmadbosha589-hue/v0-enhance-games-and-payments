"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Megaphone } from "lucide-react"
import {
  getBannerScriptUrl,
  getBannerZoneId,
  getPopupScriptUrl,
  getPopupZoneId,
  CXUA_ORIGIN,
} from "@/lib/cxua/zones"

/**
 * c.cx.ua integration — using the REAL ad-serving endpoints from the
 * publisher panel:
 *
 *   Banner: <script src="https://c.cx.ua/ad/serve/banner/{zone}"></script>
 *   Popup : <script src="https://c.cx.ua/ad/serve/popup/{zone}?f=4&t=1"></script>
 *
 * Integration model
 * -----------------
 * c.cx.ua's documented integration is "place this <script> before the
 * </body> tag" — i.e. the serve script is meant to run in the host-page
 * DOM and inject the creative wherever it's loaded.
 *
 * Earlier we tried sandbox-isolating the script inside an <iframe srcDoc>
 * for security, but that made the creative paint into a fixed-size white
 * container (the iframe's own viewport) instead of sizing to its native
 * 728×90 dimensions, producing a cut-off / mostly-empty banner.
 *
 * The implementation below injects the serve script directly into a
 * mount-point div on the parent page. Same trade-off most ad-tech sites
 * accept: the third-party script runs with first-party privileges, but
 * the creative renders correctly. We minimize the surface area by:
 *   - mounting only on the client (no SSR leak)
 *   - injecting the script into a dedicated container so it doesn't
 *     touch other parts of the DOM
 *   - re-using a single load per zone (idempotent, no duplicate scripts)
 *   - honoring Do-Not-Track
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
}: CxUaBannerProps) {
  const [zone] = useState<string>(zoneId || getBannerZoneId())
  const [mounted, setMounted] = useState(false)
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Inject the c.cx.ua banner serve script into our mount-point div.
  // The script will append its creative <a><img></a> right after itself,
  // which means it'll appear inside our mount-point.
  useEffect(() => {
    if (!mounted) return
    if (typeof window === "undefined" || typeof document === "undefined") return

    const host = mountRef.current
    if (!host) return

    // Respect Do-Not-Track. We render the wrapper (with the Sponsored
    // label) but skip the network call.
    const dnt =
      navigator.doNotTrack === "1" ||
      // @ts-expect-error legacy IE
      window.doNotTrack === "1" ||
      // @ts-expect-error Safari
      navigator.msDoNotTrack === "1"
    if (dnt) return

    // Idempotent: bail if a script is already loading/loaded inside this
    // host (e.g. React strict-mode double effect).
    if (host.querySelector(`script[data-cxua-banner="${zone}"]`)) {
      return
    }

    const src = getBannerScriptUrl(zone)
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.setAttribute("data-cxua-banner", zone)
    s.setAttribute("fetchpriority", "low")
    s.referrerPolicy = "no-referrer-when-downgrade"
    s.onerror = () => {
      s.remove()
    }
    host.appendChild(s)

    // On unmount, clean up the mount-point so a future remount re-loads
    // the creative fresh (avoids stale state across route transitions).
    return () => {
      // Remove everything inside the host — the script tag AND any DOM
      // the ad script appended.
      while (host.firstChild) host.removeChild(host.firstChild)
    }
  }, [mounted, zone])

  const wrapperCls = cn(
    "relative",
    variant === "card" && "rounded-lg border bg-card p-2 shadow-sm",
    "flex w-full flex-col items-center",
    className,
  )

  return (
    <div
      className={wrapperCls}
      data-ad-network="cx-ua"
      data-ad-zone={zone}
      data-ad-type="banner"
    >
      {showLabel && variant !== "slim" && variant !== "compact" && (
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

      {/* Mount-point for the c.cx.ua serve script. We reserve the
          creative's natural height so layout stays stable while the
          script loads, but let the creative size itself naturally —
          c.cx.ua serves at the zone-configured 728×90, and on narrower
          viewports we cap with max-width + a CSS sizing rule that the
          creative respects via standard <img> shrinking. */}
      <div
        ref={mountRef}
        className={cn(
          "w-full flex items-center justify-center",
          // Reserved space so layout doesn't jump before the ad loads.
          // The creative itself is 728×90; on narrow viewports the
          // inline <img> shrinks proportionally via the max-w-full rule
          // applied below.
          "[&_img]:max-w-full [&_img]:h-auto [&_img]:mx-auto [&_img]:block",
          "[&_a]:inline-block [&_a]:max-w-full",
        )}
        style={{
          maxWidth: maxWidth ?? width,
          minHeight: height,
        }}
        aria-label="Sponsored content"
      />
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
  useEffect(() => {
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

    const src = params
      ? getPopupScriptUrl(zone, params)
      : getPopupScriptUrl(zone)

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
  }, [zoneId, params])

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
