"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Megaphone, Sparkles } from "lucide-react"

interface CxUaBannerProps {
  className?: string
  showLabel?: boolean
  /**
   * Visual variant:
   *   - "default"  : full medium rectangle (300x250) with label row above
   *   - "compact"  : medium rectangle, no outer label row — for grid peers
   *   - "card"     : medium rectangle wrapped in a featured-partner card
   *   - "slim"     : leaderboard-style strip (320x50 mobile, 728x90 desktop)
   *                  used for sticky bottom banners so it never blocks content
   */
  variant?: "default" | "compact" | "card" | "slim"
}

/**
 * CxUaBanner - Loads the c.cx.ua banner ad script (zone 32)
 * Displays a polished container around the externally-injected banner.
 *
 * The script is loaded once per banner instance with a cache-bust token so
 * each placement renders a fresh creative.
 */
export function CxUaBanner({
  className,
  showLabel = true,
  variant = "default",
}: CxUaBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!containerRef.current) return

    // Avoid double-loading if the script tag already exists for this container
    if (containerRef.current.querySelector("script[data-cxua-banner]")) return

    const script = document.createElement("script")
    script.src = `https://c.cx.ua/ad/serve/banner/32`
    script.async = true
    script.dataset.cxuaBanner = "32"
    containerRef.current.appendChild(script)
  }, [])

  if (variant === "slim") {
    // Leaderboard-style strip for sticky banners.
    // Mobile: 320x50 mobile banner. Desktop: 728x90 leaderboard.
    // Never tall enough to obstruct page content.
    return (
      <div className={cn("relative w-full", className)}>
        {showLabel && (
          <span className="absolute -top-2 left-3 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider rounded-full bg-background border text-muted-foreground z-10">
            Sponsored
          </span>
        )}
        <div
          ref={containerRef}
          className="h-[50px] sm:h-[60px] md:h-[90px] w-full rounded-md bg-muted/20 flex items-center justify-center overflow-hidden"
          data-ad-network="cx-ua"
          aria-label="Sponsored banner"
        />
      </div>
    )
  }

  if (variant === "compact") {
    // Sized to match the surrounding network ad rectangles (300x250) so
    // impressions stay consistent across the 12-slot grid.
    return (
      <div className={cn("relative w-full h-full", className)}>
        {showLabel && (
          <span className="absolute -top-2 left-3 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider rounded-full bg-background border text-muted-foreground z-10">
            Sponsored
          </span>
        )}
        <div
          ref={containerRef}
          className="min-h-[200px] sm:min-h-[250px] w-full rounded-lg bg-muted/20 flex items-center justify-center overflow-hidden"
          data-ad-network="cx-ua"
          aria-label="Sponsored banner"
        />
      </div>
    )
  }

  if (variant === "card") {
    return (
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4 sm:p-6 overflow-hidden",
          className,
        )}
      >
        {showLabel && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Featured Partner
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/70">Sponsored</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="min-h-[200px] sm:min-h-[280px] w-full rounded-md bg-background/50 flex items-center justify-center overflow-hidden"
          data-ad-network="cx-ua"
          aria-label="Sponsored banner"
        />
      </div>
    )
  }

  return (
    <div className={cn("relative w-full", className)}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-1.5">
            <Megaphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Sponsored
            </span>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-[200px] sm:min-h-[250px] w-full rounded-lg border bg-muted/20 flex items-center justify-center overflow-hidden"
        data-ad-network="cx-ua"
        aria-label="Sponsored banner"
      >
        {!mounted && (
          <div className="text-xs text-muted-foreground/50">Loading banner...</div>
        )}
      </div>
    </div>
  )
}

/**
 * CxUaPopupLoader - Loads the c.cx.ua popup redirect script (zone 31) globally.
 * Should be rendered once at the app/dashboard layout level.
 *
 * f=1&t=24: frequency=1, throttle=24 hours per visitor.
 */
export function CxUaPopupLoader() {
  useEffect(() => {
    // Don't load on bots or when window is missing
    if (typeof window === "undefined") return

    // Avoid duplicate loads across client navigations
    if (document.querySelector("script[data-cxua-popup]")) return

    const script = document.createElement("script")
    script.src = "https://c.cx.ua/ad/serve/popup/31?f=1&t=24"
    script.async = true
    script.dataset.cxuaPopup = "31"
    document.body.appendChild(script)

    return () => {
      // Intentionally not removed on unmount - popup script should persist
    }
  }, [])

  return null
}
