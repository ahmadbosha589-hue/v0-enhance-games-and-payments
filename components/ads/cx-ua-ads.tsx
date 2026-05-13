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
 * Why the previous "drop the <script> in a React tree" approach didn't work
 * --------------------------------------------------------------------------
 *  • The banner script uses legacy `document.write()` to inject its
 *    creative at the script tag's location. React loads scripts
 *    asynchronously, AFTER `DOMContentLoaded`, at which point
 *    `document.write` becomes destructive (or silently no-ops in modern
 *    browsers) — so the banner never renders.
 *
 *    Fix: render the banner inside an `<iframe srcDoc>` so the script
 *    runs against a fresh, still-parsing document where `document.write`
 *    is legal again.
 *
 *  • The popup script installs a global click-hook that opens a popunder.
 *    React 18+ strict mode mounts/unmounts effects twice in dev, which
 *    causes the script tag to be added/removed in rapid succession and
 *    the hook to be lost. Plus, if we let React control the `<script>` in
 *    the tree, the script element gets garbage-collected when its parent
 *    unmounts, killing the listener.
 *
 *    Fix: append the script element directly to `document.body` (outside
 *    React's reconciliation tree), and refuse to re-inject if it's
 *    already present.
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
   * Visual layout variant.
   *   - "default"  : 300x250 medium rectangle, centered, with label
   *   - "compact"  : 300x250 with no extra chrome (for grids)
   *   - "card"     : 300x250 wrapped in a soft card
   *   - "slim"     : responsive leaderboard — 320x50 mobile, 728x90 desktop
   */
  variant?: "default" | "compact" | "card" | "slim"
  /**
   * Optional explicit pixel size override. If set, takes precedence over
   * variant defaults. Useful when a zone is configured for a non-standard
   * size in the c.cx.ua panel.
   */
  width?: number
  height?: number
  /** No-op, kept for API compatibility with older callers. */
  userId?: string | null
}

/**
 * Builds the srcDoc HTML for the iframe. Keep this minimal — every byte
 * here is parsed before the ad script runs. We DON'T include a doctype
 * fallback hack: modern browsers handle `<!doctype html>` srcdoc fine.
 */
function buildBannerSrcDoc(zoneId: string): string {
  const scriptUrl = getBannerScriptUrl(zoneId)
  // Inline CSS reset so the iframe's body doesn't add an 8px margin and
  // shift the creative. `overflow: hidden` to avoid scrollbars on
  // pixel-rounding edge cases. Background is transparent so the parent's
  // theme shows through if the creative has any whitespace.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_top">
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;min-height:100vh}
a,img,iframe,div{max-width:100%}
</style>
</head>
<body>
<script src="${scriptUrl}"></script>
</body>
</html>`
}

/** Returns the iframe dimensions for the chosen variant + overrides. */
function getBannerDims(
  variant: NonNullable<CxUaBannerProps["variant"]>,
  width?: number,
  height?: number,
): { w: number; h: number; responsive: boolean } {
  if (width && height) return { w: width, h: height, responsive: false }
  switch (variant) {
    case "slim":
      // 728x90 leaderboard with mobile fallback to 320x50.
      return { w: 728, h: 90, responsive: true }
    case "card":
    case "compact":
    case "default":
    default:
      return { w: 300, h: 250, responsive: false }
  }
}

/**
 * CxUaBanner — renders a c.cx.ua banner zone in a sandboxed iframe so the
 * legacy `document.write()` ad code can inject its creative safely.
 */
export function CxUaBanner({
  className,
  showLabel = true,
  zoneId,
  variant = "default",
  width,
  height,
}: CxUaBannerProps) {
  const [zone] = useState<string>(zoneId || getBannerZoneId())
  const [mounted, setMounted] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Best-effort ad-block detection: if the iframe never paints any
  // children (e.g. the c.cx.ua origin is on a filter list), surface a
  // graceful fallback instead of an empty grey box.
  useEffect(() => {
    if (!mounted) return
    const t = window.setTimeout(() => {
      const f = iframeRef.current
      if (!f) return
      try {
        const doc = f.contentDocument
        // If the iframe body is empty after 2.5s, treat as blocked. We
        // can read the body because srcDoc gives us same-origin access.
        if (doc && doc.body && doc.body.children.length === 0) {
          setBlocked(true)
        }
      } catch {
        // Cross-origin — once the ad script swaps the document it may
        // become inaccessible, which is actually a GOOD sign (script ran).
      }
    }, 2500)
    return () => window.clearTimeout(t)
  }, [mounted])

  const { w, h, responsive } = getBannerDims(variant, width, height)
  const srcDoc = mounted ? buildBannerSrcDoc(zone) : undefined

  // SSR / pre-mount: render a stable skeleton with matching dimensions so
  // there's no layout shift when the iframe pops in.
  const wrapperCls = cn(
    "relative w-full",
    variant === "card" && "rounded-lg border bg-card p-2 shadow-sm",
    className,
  )

  const iframeCls = cn(
    "block border-0 bg-transparent",
    responsive
      ? "h-[50px] w-full sm:h-[60px] md:h-[90px] md:max-w-[728px] md:mx-auto"
      : "mx-auto",
  )

  return (
    <div
      className={wrapperCls}
      data-ad-network="cx-ua"
      data-ad-zone={zone}
      data-ad-type="banner"
    >
      {showLabel && variant !== "slim" && (
        <div className="mb-1.5 flex items-center justify-between px-1">
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

      {/* Pre-hydration skeleton — keeps SSR + CSR markup compatible. */}
      {!mounted && (
        <div
          aria-hidden="true"
          className={cn(
            "rounded-md bg-muted/20",
            responsive
              ? "h-[50px] w-full sm:h-[60px] md:h-[90px]"
              : "mx-auto",
          )}
          style={responsive ? undefined : { width: w, height: h }}
        />
      )}

      {mounted && !blocked && (
        <iframe
          ref={iframeRef}
          title="Sponsored content"
          srcDoc={srcDoc}
          width={responsive ? undefined : w}
          height={responsive ? undefined : h}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          // Allow scripts and popups (the banner click typically opens an
          // offer in a new tab). `allow-popups-to-escape-sandbox` lets the
          // popup open without inheriting the sandbox restrictions.
          // We intentionally OMIT `allow-same-origin` so the third-party
          // script can't read parent cookies/localStorage.
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-forms"
          allow="autoplay 'none'; geolocation 'none'; microphone 'none'; camera 'none'"
          // `scrolling="no"` is deprecated but still respected — combined
          // with body{overflow:hidden} this kills accidental scrollbars.
          scrolling="no"
          className={iframeCls}
          style={responsive ? undefined : { width: w, height: h }}
        />
      )}

      {/* Graceful fallback when AdBlock or a CSP swallows the iframe. We
          keep the layout stable but render nothing visible so the page
          doesn't show a broken-ad placeholder. */}
      {mounted && blocked && (
        <div
          aria-hidden="true"
          className={cn(
            "rounded-md",
            responsive ? "h-[50px] w-full sm:h-[60px] md:h-[90px]" : "mx-auto",
          )}
          style={responsive ? undefined : { width: w, height: h }}
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
 *
 * Mounts safely under React strict mode (double-mount-proof via a DOM
 * marker), idempotent across SPA navigations.
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
    // `data-cxua-popup` lets us recognise the tag for idempotency.
    s.setAttribute(POPUP_MARKER_ATTR, zone)
    // Tell browsers we don't need this resource on the critical path.
    s.setAttribute("fetchpriority", "low")
    // Some browsers honour `referrerpolicy` on script tags — give c.cx.ua
    // the referrer so they can attribute the impression.
    s.referrerPolicy = "no-referrer-when-downgrade"

    s.onerror = () => {
      // AdBlock / network failure. Don't surface to the UI — silently bail.
      s.remove()
    }

    document.body.appendChild(s)

    // NOTE: we deliberately DO NOT remove the script on unmount. The
    // popunder script installs document-level event listeners on first
    // load; removing the <script> tag wouldn't remove those listeners
    // anyway, and re-adding the script would create duplicate handlers.
    // Leaving the tag in place is the safest and least-disruptive
    // approach for SPA navigation.
  }, [zoneId, params])

  return null
}

// ---------------------------------------------------------------------------
// Preconnect hint (perf optimization)
// ---------------------------------------------------------------------------

/**
 * `<CxUaPreconnect />` — drop this in the root layout's `<head>` (or anywhere
 * inside the document) to warm up the TLS handshake to c.cx.ua before the
 * iframe / popup script actually requests anything. Cuts ~150-400ms off
 * first ad paint on cold loads.
 *
 * Usage in `app/layout.tsx`:
 *   import { CxUaPreconnect } from "@/components/ads/cx-ua-ads"
 *   ...
 *   <head>
 *     <CxUaPreconnect />
 *   </head>
 */
export function CxUaPreconnect() {
  return (
    <>
      <link rel="preconnect" href={CXUA_ORIGIN} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={CXUA_ORIGIN} />
    </>
  )
}
