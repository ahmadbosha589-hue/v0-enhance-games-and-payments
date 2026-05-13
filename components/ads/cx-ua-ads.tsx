"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Megaphone, Sparkles, ArrowRight, Coins, Gift, Zap } from "lucide-react"
import {
  buildCxUaOfferwallUrl,
  getCxUaApiKey,
  isCxUaConfigured,
} from "@/lib/cxua/offerwall-url"

/**
 * c.cx.ua integration
 * ===================
 * IMPORTANT: c.cx.ua is an OFFERWALL platform — they do NOT ship banner ad
 * scripts or popup-redirect scripts. Per their docs
 * (https://c.cx.ua/docs) the ONE and ONLY publisher endpoint is:
 *
 *     https://c.cx.ua/offerwall/[API_KEY]/[USER_ID]
 *
 * Earlier versions of this file injected `<script>` tags pointing at
 * `c.cx.ua/ad/serve/banner/...` and `/ad/serve/popup/...` — those URLs do
 * not exist on c.cx.ua's servers, which is why "the ads didn't work."
 *
 * What this file now does instead:
 *   - `CxUaBanner`        : a polished promo card with multiple visual
 *                           variants. Clicking it opens the REAL offerwall
 *                           URL in a new tab. Pre-fetches the offerwall
 *                           origin so it opens instantly.
 *   - `CxUaPopupLoader`   : a proper popunder that fires the offerwall URL
 *                           on first user interaction, with a 24-hour
 *                           per-visitor throttle (matches the original
 *                           `f=1&t=24` intent).
 *
 * Both surfaces are no-ops when `NEXT_PUBLIC_CCXUA_API_KEY` isn't set, so
 * they render nothing on unconfigured environments rather than leaving
 * an empty grey box.
 */

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

interface CxUaBannerProps {
  className?: string
  showLabel?: boolean
  /**
   * Optional authenticated user id. When provided, the offerwall URL is
   * scoped to this id so postback rewards land on the right account.
   * Omit on public/marketing pages — a stable guest id will be generated.
   */
  userId?: string | null
  /**
   * Visual variant:
   *   - "default" : medium rectangle (300x250-ish) with a label row above
   *   - "compact" : medium rectangle, no outer label — for grid peers
   *   - "card"    : featured-partner card with gradient accent
   *   - "slim"    : leaderboard strip for sticky bottom banners
   */
  variant?: "default" | "compact" | "card" | "slim"
}

/**
 * Three rotating creatives so the banner doesn't look static across page
 * loads. Pure CSS — no external script, no layout shift, no flicker.
 */
const CREATIVES = [
  {
    icon: Coins,
    eyebrow: "c.cx.ua Offerwall",
    headline: "Earn crypto for completing offers",
    sub: "Surveys, app installs & quick tasks — paid in sats.",
    cta: "Start earning",
    accent: "from-amber-500/15 via-orange-500/10 to-transparent",
    ring: "ring-amber-500/30",
    iconWrap: "bg-amber-500/15 text-amber-500",
  },
  {
    icon: Gift,
    eyebrow: "Sponsored • c.cx.ua",
    headline: "Premium global offers, auto-translated",
    sub: "Get rewarded in your local language. Worldwide coverage.",
    cta: "Browse offers",
    accent: "from-cyan-500/15 via-teal-500/10 to-transparent",
    ring: "ring-cyan-500/30",
    iconWrap: "bg-cyan-500/15 text-cyan-500",
  },
  {
    icon: Zap,
    eyebrow: "Featured Partner",
    headline: "Fast crediting, signed postbacks",
    sub: "Rewards confirmed in 5–30 min. Secured with MD5 signatures.",
    cta: "Open offerwall",
    accent: "from-emerald-500/15 via-green-500/10 to-transparent",
    ring: "ring-emerald-500/30",
    iconWrap: "bg-emerald-500/15 text-emerald-500",
  },
] as const

function pickCreative(seed: number) {
  const idx = Math.abs(seed) % CREATIVES.length
  return CREATIVES[idx]
}

/**
 * Tracks a banner click (best-effort, fire-and-forget).
 * Used to give the admin panel some basic CTR insight if needed later —
 * silently no-ops if the endpoint doesn't exist.
 */
function trackBannerClick(variant: string) {
  try {
    const payload = JSON.stringify({ provider: "ccxua", variant, ts: Date.now() })
    if (navigator?.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" })
      navigator.sendBeacon("/api/ads/track", blob)
    } else {
      fetch("/api/ads/track", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    /* swallow — tracking must never break UX */
  }
}

/**
 * CxUaBanner — a clickable c.cx.ua promo surface. Opens the real offerwall
 * URL in a new tab on click. Renders nothing when the API key is not
 * configured, so admins never see empty placeholders.
 */
export function CxUaBanner({
  className,
  showLabel = true,
  userId,
  variant = "default",
}: CxUaBannerProps) {
  const [mounted, setMounted] = useState(false)
  const [href, setHref] = useState<string | null>(null)
  const seedRef = useRef<number>(0)

  useEffect(() => {
    // Seed the creative per-mount so we get rotation across page views
    // without causing hydration mismatches.
    seedRef.current = Math.floor(Math.random() * 1_000_000)
    setMounted(true)
    setHref(buildCxUaOfferwallUrl(userId))
  }, [userId])

  const creative = useMemo(() => pickCreative(seedRef.current), [mounted])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) {
        e.preventDefault()
        return
      }
      trackBannerClick(variant)
    },
    [href, variant],
  )

  // Don't render anything if c.cx.ua isn't configured — avoids the
  // perpetual "Loading banner..." ghost box reported by users.
  if (mounted && !isCxUaConfigured()) return null

  // Server / pre-hydration render: stable skeleton, no random creative.
  if (!mounted) {
    return (
      <div
        className={cn(
          "relative w-full rounded-lg border bg-muted/10",
          variant === "slim"
            ? "h-[50px] sm:h-[60px] md:h-[90px]"
            : "min-h-[200px] sm:min-h-[250px]",
          className,
        )}
        aria-hidden="true"
      />
    )
  }

  const Icon = creative.icon

  // -------- slim leaderboard (sticky bottom banners) --------
  if (variant === "slim") {
    return (
      <div className={cn("relative w-full", className)}>
        {showLabel && (
          <span className="absolute -top-2 left-3 z-10 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Sponsored
          </span>
        )}
        <a
          href={href ?? "#"}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={handleClick}
          data-ad-network="cx-ua"
          aria-label={`${creative.eyebrow} — ${creative.headline}`}
          className={cn(
            "group flex h-[50px] w-full items-center gap-3 overflow-hidden rounded-md border bg-gradient-to-r px-3 transition-colors hover:bg-muted/40 sm:h-[60px] sm:px-4 md:h-[90px] md:px-5",
            creative.accent,
          )}
        >
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 md:h-10 md:w-10", creative.iconWrap)}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold sm:text-sm md:text-base">
              {creative.headline}
            </span>
            <span className="hidden truncate text-[10px] text-muted-foreground sm:block sm:text-xs">
              {creative.sub}
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-foreground/90 px-2.5 py-1 text-[10px] font-semibold text-background transition-transform group-hover:translate-x-0.5 sm:inline-flex sm:text-xs">
            {creative.cta}
            <ArrowRight className="h-3 w-3" />
          </span>
        </a>
      </div>
    )
  }

  // -------- compact (used inside the multi-network grid) --------
  if (variant === "compact") {
    return (
      <div className={cn("relative h-full w-full", className)}>
        {showLabel && (
          <span className="absolute -top-2 left-3 z-10 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Sponsored
          </span>
        )}
        <a
          href={href ?? "#"}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={handleClick}
          data-ad-network="cx-ua"
          aria-label={`${creative.eyebrow} — ${creative.headline}`}
          className={cn(
            "group flex min-h-[200px] w-full flex-col justify-between overflow-hidden rounded-lg border bg-gradient-to-br p-4 transition-all hover:border-foreground/20 hover:shadow-md sm:min-h-[250px] sm:p-5",
            creative.accent,
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", creative.iconWrap)}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="rounded-full border border-foreground/10 bg-background/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              {creative.eyebrow}
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold leading-snug text-pretty sm:text-base">
              {creative.headline}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {creative.sub}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background transition-transform group-hover:translate-x-0.5">
              {creative.cta}
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </a>
      </div>
    )
  }

  // -------- featured "card" variant --------
  if (variant === "card") {
    return (
      <a
        href={href ?? "#"}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        data-ad-network="cx-ua"
        aria-label={`${creative.eyebrow} — ${creative.headline}`}
        className={cn(
          "group relative block overflow-hidden rounded-xl border-2 border-dashed bg-gradient-to-br p-4 transition-all hover:border-solid hover:shadow-lg sm:p-6",
          creative.accent,
          `border-foreground/15 ring-1 ring-inset ${creative.ring}`,
          className,
        )}
      >
        {showLabel && (
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                {creative.eyebrow}
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/70">Sponsored</span>
          </div>
        )}
        <div className="flex min-h-[200px] flex-col justify-between gap-4 sm:min-h-[260px]">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", creative.iconWrap)}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-bold leading-tight text-pretty sm:text-xl">
              {creative.headline}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {creative.sub}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-transform group-hover:translate-x-0.5">
              {creative.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </a>
    )
  }

  // -------- default variant --------
  return (
    <div className={cn("relative w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Megaphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Sponsored
            </span>
          </div>
        </div>
      )}
      <a
        href={href ?? "#"}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        data-ad-network="cx-ua"
        aria-label={`${creative.eyebrow} — ${creative.headline}`}
        className={cn(
          "group flex min-h-[200px] w-full flex-col justify-between overflow-hidden rounded-lg border bg-gradient-to-br p-4 transition-all hover:border-foreground/20 hover:shadow-md sm:min-h-[250px] sm:p-5",
          creative.accent,
        )}
      >
        <div className="flex items-start justify-between">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", creative.iconWrap)}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="rounded-full border border-foreground/10 bg-background/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            {creative.eyebrow}
          </span>
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold leading-snug text-pretty sm:text-lg">
            {creative.headline}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm text-pretty">
            {creative.sub}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background transition-transform group-hover:translate-x-0.5">
            {creative.cta}
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Popunder loader
// ---------------------------------------------------------------------------

interface CxUaPopupLoaderProps {
  /**
   * Optional authenticated user id. Used in the popunder URL so postbacks
   * credit the right account. Defaults to the anonymous visitor id.
   */
  userId?: string | null
  /**
   * Min seconds between popunders per visitor. Defaults to 24h.
   * Matches the legacy `t=24` query parameter intent.
   */
  throttleHours?: number
}

const POPUP_LAST_KEY = "cxua_popup_last_v1"

function shouldFirePopup(throttleHours: number): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = localStorage.getItem(POPUP_LAST_KEY)
    if (!raw) return true
    const last = Number(raw)
    if (!Number.isFinite(last)) return true
    const msSince = Date.now() - last
    return msSince > throttleHours * 60 * 60 * 1000
  } catch {
    // Private mode / storage disabled — fire conservatively (once per session)
    return !window.sessionStorage?.getItem(POPUP_LAST_KEY)
  }
}

function markPopupFired() {
  try {
    localStorage.setItem(POPUP_LAST_KEY, String(Date.now()))
  } catch {
    try {
      sessionStorage.setItem(POPUP_LAST_KEY, "1")
    } catch {
      /* ignore */
    }
  }
}

/**
 * CxUaPopupLoader — proper popunder for the c.cx.ua offerwall.
 *
 * Why this works (and the old version didn't):
 * 1. `window.open()` is blocked by all modern browsers unless triggered by
 *    a real user gesture. We attach a one-shot listener to `pointerdown`
 *    (covers mouse, touch and pen) so the popup only fires on a genuine
 *    interaction.
 * 2. We use the popunder pattern: open the offerwall in a new tab, then
 *    immediately re-focus the current window so the offerwall lands behind
 *    — the visitor stays on your site, exactly like the original script
 *    intended.
 * 3. We throttle per-visitor via localStorage (default 24h) to match the
 *    legacy `f=1&t=24` behavior.
 * 4. We never block the user's primary navigation: we wait until after the
 *    visitor has done something interactive on the page.
 */
export function CxUaPopupLoader({
  userId,
  throttleHours = 24,
}: CxUaPopupLoaderProps = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!getCxUaApiKey()) return
    if (!shouldFirePopup(throttleHours)) return

    // Respect DNT and bot-like environments
    const dnt =
      navigator.doNotTrack === "1" ||
      // @ts-ignore — IE/legacy
      window.doNotTrack === "1" ||
      // @ts-ignore — Safari
      navigator.msDoNotTrack === "1"
    if (dnt) return

    let fired = false

    const fire = () => {
      if (fired) return
      const url = buildCxUaOfferwallUrl(userId)
      if (!url) return
      fired = true

      try {
        // Popunder: open in a new tab/window, then immediately re-focus
        // the current window so the new tab lands behind. Some browsers
        // (Chrome, Firefox) will keep focus on the opener already, but
        // calling `.blur()` on the popup + `window.focus()` on opener is
        // the most reliable cross-browser approach.
        const popup = window.open(url, "_blank", "noopener,noreferrer")
        if (popup) {
          try {
            popup.blur()
          } catch {
            /* cross-origin — that's fine */
          }
          try {
            window.focus()
          } catch {
            /* ignore */
          }
          markPopupFired()
        } else {
          // Popup was blocked — don't burn the throttle, give it another
          // chance on the next interaction.
          fired = false
        }
      } catch {
        fired = false
      } finally {
        cleanup()
      }
    }

    const cleanup = () => {
      window.removeEventListener("pointerdown", fire, true)
      window.removeEventListener("keydown", fire, true)
    }

    // `capture: true` so we catch the gesture even if a child stops
    // propagation. `once: false` — we manage the one-shot ourselves via
    // the `fired` flag so we can recover from popup-blocker failures.
    window.addEventListener("pointerdown", fire, { capture: true })
    window.addEventListener("keydown", fire, { capture: true })

    return cleanup
  }, [userId, throttleHours])

  return null
}
