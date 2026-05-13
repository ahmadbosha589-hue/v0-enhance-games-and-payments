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
 * Banner sizing
 * -------------
 * c.cx.ua serves whatever creative size the zone is configured for in the
 * publisher panel (300x250, 468x60, 728x90, 160x600, custom, etc.). We
 * MUST NOT force a fixed size — instead, we let the script render at its
 * natural dimensions inside a sandboxed iframe and resize the iframe to
 * match what the creative actually paints. This is the same trick Google
 * AdSense's "fluid" units use.
 */

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

interface CxUaBannerProps {
  className?: string
  showLabel?: boolean
  /** Override the configured zone id (defaults to env / panel default). */
  zoneId?: string
  /**
   * Optional visual chrome. Sizing is ALWAYS the creative's natural size
   * — this only controls the surrounding wrapper.
   *   - "default" : centered with a small "Sponsored" label above
   *   - "compact" : no chrome (just the ad)
   *   - "card"    : wrapped in a soft card
   *   - "slim"    : minimal chrome, floating "Sponsored" pill
   */
  variant?: "default" | "compact" | "card" | "slim"
  /** No-op, kept for API compatibility with older callers. */
  userId?: string | null
  /**
   * Maximum width to constrain the banner to (in case the creative is
   * wider than the container). Default: no max (creative's natural width).
   */
  maxWidth?: number
}

/**
 * Builds the srcDoc HTML for the iframe. The body lets its content size
 * itself (no flex-center, no min-height) so we can read the true creative
 * dimensions from `documentElement.scrollWidth/Height`.
 */
function buildBannerSrcDoc(zoneId: string): string {
  const scriptUrl = getBannerScriptUrl(zoneId)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_top">
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:system-ui,sans-serif;line-height:0}
body{display:inline-block}
img,iframe{display:block;border:0;max-width:100%;height:auto}
a{display:inline-block;line-height:0}
</style>
</head>
<body>
<script src="${scriptUrl}"></script>
</body>
</html>`
}

/**
 * CxUaBanner — renders a c.cx.ua banner zone in a sandboxed iframe sized
 * to the creative's natural dimensions.
 */
export function CxUaBanner({
  className,
  showLabel = true,
  zoneId,
  variant = "default",
  maxWidth,
}: CxUaBannerProps) {
  const [zone] = useState<string>(zoneId || getBannerZoneId())
  const [mounted, setMounted] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // The iframe's measured natural dimensions. Null until the first
  // measurement comes in.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Measure the creative's natural size as soon as it paints, then keep
  // it in sync with any subsequent layout changes (animated creatives,
  // responsive units, etc).
  useEffect(() => {
    if (!mounted) return
    const f = iframeRef.current
    if (!f) return

    let ro: ResizeObserver | null = null
    let pollTimer: number | null = null
    let blockTimer: number | null = null

    const measure = () => {
      try {
        const doc = f.contentDocument
        if (!doc) return false
        // Prefer the documentElement's scroll size — that's what the
        // creative *wants* to be. Fall back to body in old browsers.
        const root = doc.documentElement
        const body = doc.body
        if (!root || !body) return false
        const w = Math.max(
          root.scrollWidth,
          body.scrollWidth,
          root.offsetWidth,
          body.offsetWidth,
        )
        const h = Math.max(
          root.scrollHeight,
          body.scrollHeight,
          root.offsetHeight,
          body.offsetHeight,
        )
        if (w > 0 && h > 0) {
          setDims((prev) =>
            prev && prev.w === w && prev.h === h ? prev : { w, h },
          )
          return true
        }
        return false
      } catch {
        // The ad script swapped the document to a cross-origin location
        // — we can no longer measure. That's actually a success signal
        // (the script ran). Stop trying.
        return true
      }
    }

    const attach = () => {
      try {
        const doc = f.contentDocument
        if (!doc || !doc.body) return
        // Initial measurement once the inner document is ready.
        measure()
        // Keep measuring whenever the creative resizes (lazy-loaded
        // images, animated banners, responsive units).
        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => measure())
          ro.observe(doc.documentElement)
          ro.observe(doc.body)
        }
      } catch {
        // Cross-origin — can't measure. Leave dims as-is.
      }
    }

    // The iframe's `load` event fires once the srcDoc has been parsed.
    // After that, the ad script may still be running async, so we also
    // poll for a short window to catch late-rendered creatives.
    const onLoad = () => {
      attach()
      let attempts = 0
      pollTimer = window.setInterval(() => {
        attempts += 1
        const done = measure()
        if (done || attempts > 20) {
          if (pollTimer !== null) {
            window.clearInterval(pollTimer)
            pollTimer = null
          }
        }
      }, 250)
    }
    f.addEventListener("load", onLoad)

    // AdBlock detection: if no creative has painted after 3s, fall back.
    blockTimer = window.setTimeout(() => {
      try {
        const doc = f.contentDocument
        if (doc && doc.body && doc.body.children.length === 0) {
          setBlocked(true)
        }
      } catch {
        // ignore
      }
    }, 3000)

    return () => {
      f.removeEventListener("load", onLoad)
      if (ro) ro.disconnect()
      if (pollTimer !== null) window.clearInterval(pollTimer)
      if (blockTimer !== null) window.clearTimeout(blockTimer)
    }
  }, [mounted])

  const srcDoc = mounted ? buildBannerSrcDoc(zone) : undefined

  const wrapperCls = cn(
    "relative",
    variant === "card" && "rounded-lg border bg-card p-2 shadow-sm",
    // Center the iframe within its container so non-full-width creatives
    // (e.g. a 300x250 sitting in an 800px column) don't hang to the left.
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

      {/* Pre-hydration / pre-measurement skeleton. We don't know the real
          dimensions yet, so just hold a small space and let the iframe
          replace us when it has measured itself. */}
      {(!mounted || (mounted && !blocked && !dims)) && (
        <div
          aria-hidden="true"
          className="h-[90px] w-full max-w-[728px] rounded-md bg-muted/20"
        />
      )}

      {mounted && !blocked && (
        <iframe
          ref={iframeRef}
          title="Sponsored content"
          srcDoc={srcDoc}
          // Apply measured natural size. Until measured, render at zero
          // so we don't double-show (skeleton above covers the gap).
          width={dims?.w}
          height={dims?.h}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          // We intentionally OMIT `allow-same-origin` so the third-party
          // script can't read parent cookies/localStorage. We DO need
          // `allow-scripts` (obvious) and the popup permissions so the
          // banner's click-through (which c.cx.ua opens via a top-frame
          // navigation) works.
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-forms"
          allow="autoplay 'none'; geolocation 'none'; microphone 'none'; camera 'none'"
          scrolling="no"
          className={cn(
            "block border-0 bg-transparent",
            // Hide the iframe entirely until it has measured itself, so
            // there's no flash of zero-sized content.
            !dims && "invisible absolute",
          )}
          style={
            dims
              ? {
                  width: dims.w,
                  height: dims.h,
                  maxWidth: maxWidth ?? "100%",
                }
              : undefined
          }
        />
      )}

      {/* Graceful fallback when AdBlock or a CSP swallows the iframe. */}
      {mounted && blocked && (
        <div
          aria-hidden="true"
          className="h-[1px] w-full"
        />
      )}
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
