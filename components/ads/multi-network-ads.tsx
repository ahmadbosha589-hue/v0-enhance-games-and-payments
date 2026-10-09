"use client"

import { useEffect, useState, useRef, useCallback, memo } from "react"
import Script from "next/script"
import { cn } from "@/lib/utils"
import { RefreshCw } from "lucide-react"
import { CxUaBanner } from "@/components/ads/cx-ua-ads"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { useAdConfig } from "@/lib/ads/use-ad-config"
import { subscribeAdRefresh } from "@/lib/ads/ad-refresh-bus"
import { isNetworkRenderable } from "@/lib/ads/registry"
import { FirstPartyAdSlot } from "@/components/ads/adapters/first-party"

// 11 ad networks (excluding Google which is handled separately)
const AD_NETWORKS = [
  { id: "a-ads", name: "A-ADS", refreshInterval: 30000, color: "bg-blue-500" },
  { id: "coinzilla", name: "CoinZilla", refreshInterval: 45000, color: "bg-amber-500" },
  { id: "bitmedia", name: "BitMedia", refreshInterval: 40000, color: "bg-orange-500" },
  { id: "cointraffic", name: "CoinTraffic", refreshInterval: 35000, color: "bg-green-500" },
  { id: "medianet", name: "Media.net", refreshInterval: 50000, color: "bg-purple-500" },
  { id: "hilltopads", name: "HilltopAds", refreshInterval: 30000, color: "bg-red-500" },
  { id: "adsterra", name: "Adsterra", refreshInterval: 45000, color: "bg-cyan-500" },
  { id: "propellerads", name: "PropellerAds", refreshInterval: 40000, color: "bg-pink-500" },
  { id: "trafficstars", name: "TrafficStars", refreshInterval: 35000, color: "bg-indigo-500" },
  { id: "mellowads", name: "MellowAds", refreshInterval: 50000, color: "bg-teal-500" },
  // AdsKeeper only refreshes on page load, not on timer
  { id: "adskeeper", name: "AdsKeeper", refreshInterval: 0, color: "bg-emerald-500", pageLoadOnly: true },
] as const

const RENDERABLE_NETWORKS = AD_NETWORKS.filter((network) => isNetworkRenderable(network.id))

// c.cx.ua is a separate partner banner — rendered as a 12th slot inside the
// network grid so it visually sits alongside the other 11 networks for
// uniform impressions. It uses its own loader (see CxUaBanner).

interface AdNetworkConfig {
  enabled: boolean
  publisherId?: string
  zoneId?: string
  slotId?: string
  [key: string]: unknown
}

interface MultiNetworkAdsProps {
  className?: string
  position?: "header" | "sidebar" | "content" | "footer"
  layout?: "grid" | "stack" | "inline"
  showLabels?: boolean
  lazyLoad?: boolean
  priority?: "high" | "medium" | "low"
  /**
   * Visual density for the slot heights.
   *   - "default": 200/250px min-height — best for dedicated ad surfaces
   *     like dashboards, the watch-ad modal, and earning pages.
   *   - "compact": 120/150px min-height — best for marketing pages where
   *     ads should not dominate the layout.
   */
  density?: "default" | "compact"
}

// Memoized skeleton for lazy loading
const AdsSkeleton = memo(function AdsSkeleton({ layout }: { layout: string }) {
  const getLayoutClasses = () => {
    switch (layout) {
      case "grid":
        return "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3"
      case "stack":
        return "flex flex-col gap-2"
      case "inline":
        return "flex flex-wrap gap-2"
      default:
        return "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 sm:p-4 animate-pulse">
      <div className={getLayoutClasses()}>
        {/* 11 networks + cx.ua = 12 placeholders */}
        {[...RENDERABLE_NETWORKS, { id: "cx-ua" }].map((network) => (
          <div
            key={network.id}
            className="min-h-[180px] sm:min-h-[220px] rounded-md bg-muted/50"
          />
        ))}
      </div>
    </div>
  )
})

// Memoized network ad slot - renders the network's REAL publisher tag once the
// network is both registry-enabled and has a usable credential from
// /api/ads/config. Previously this rendered an empty placeholder box for every
// enabled network, so enabling a network in the admin panel never surfaced
// anything on the page.
const NetworkAdSlot = memo(function NetworkAdSlot({
  network,
  refreshCount,
  position,
  isVisible,
  density = "default",
}: {
  network: typeof AD_NETWORKS[number]
  refreshCount: number
  position: string
  showLabel?: boolean
  isVisible: boolean
  density?: "default" | "compact"
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const hasMarketingConsent = useAdConsent()
  const { configs: adConfigs } = useAdConfig(hasMarketingConsent)
  const config = adConfigs?.[network.id] as { enabled?: boolean; publisherId?: string; zoneId?: string } | undefined

  const slotHeight =
    density === "compact"
      ? "min-h-[120px] sm:min-h-[150px]"
      : "min-h-[200px] sm:min-h-[250px]"

  const renderable = Boolean(config?.enabled && (config.publisherId || config.zoneId))

  // Ad slot container - the network's real creative is injected here.
  return (
    <div
      ref={slotRef}
      className={cn(
        "relative w-full rounded-md overflow-hidden border border-border/40 bg-muted/10",
        slotHeight
      )}
      data-ad-network={network.id}
      data-ad-position={position}
      data-refresh-count={refreshCount}
      data-page-load-only={"pageLoadOnly" in network ? network.pageLoadOnly : false}
    >
      {!renderable ? (
        <div className="w-full h-full flex items-center justify-center" id={`ad-${network.id}-${position}`} data-ad-slot={`${network.id}-${position}`} />
      ) : network.id === "a-ads" ? (
        <iframe
          data-aa={config!.publisherId}
          src={`//ad.a-ads.com/${config!.publisherId}?size=Adaptive`}
          style={{ border: 0, padding: 0, width: "100%", height: "100%", overflow: "hidden", display: "block", margin: "auto", backgroundColor: "transparent" }}
          title="A-ADS sponsored ad"
          loading="lazy"
        />
      ) : network.id === "bitmedia" ? (
        <iframe
          src={`https://bitmedia.io/embed/${config!.zoneId}`}
          style={{ border: 0, padding: 0, width: "100%", height: "100%", overflow: "hidden", display: "block", margin: "auto", backgroundColor: "transparent" }}
          title="Bitmedia sponsored ad"
          scrolling="no"
          loading="lazy"
        />
      ) : network.id === "coinzilla" ? (
        <>
          <div
            className="coinzilla"
            data-zone={config!.zoneId}
            style={{ width: "100%", height: "100%" }}
          />
          <Script src="https://coinzillatag.com/lib/display.js" strategy="lazyOnload" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center" id={`ad-${network.id}-${position}`} data-ad-slot={`${network.id}-${position}`} />
      )}
    </div>
  )
})

export const MultiNetworkAds = memo(function MultiNetworkAds({
  className,
  position = "content",
  layout = "grid",
  showLabels = false,
  lazyLoad = true,
  priority = "medium",
  density = "default",
}: MultiNetworkAdsProps) {
  const [refreshCounts, setRefreshCounts] = useState<Record<string, number>>({})
  const [isVisible, setIsVisible] = useState(!lazyLoad || priority === "high")
  const [shouldRender, setShouldRender] = useState(!lazyLoad || priority === "high")
  const [cxuaVisible, setCxuaVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasMarketingConsent = useAdConsent()
  const { configs: adConfigs, isLoading: configLoading } = useAdConfig(hasMarketingConsent)

  const enabledNetworks = RENDERABLE_NETWORKS
    .filter((network) => {
      const config = adConfigs?.[network.id] as AdNetworkConfig | undefined
      if (!config?.enabled) return false
      return Boolean(config.publisherId || config.zoneId || config.slotId)
    })
    .map((network) => network.id)

  // Lazy load with Intersection Observer
  useEffect(() => {
    if (!lazyLoad || isVisible) return

    const element = containerRef.current
    if (!element) return

    // Check if already in viewport
    const rect = element.getBoundingClientRect()
    if (rect.top < window.innerHeight + 300 && rect.bottom > -300) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: "300px", // Start loading 300px before visible
        threshold: 0.01
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [lazyLoad, isVisible])

  // Delayed render based on priority
  useEffect(() => {
    if (!isVisible || shouldRender) return

    const delay = priority === "high" ? 0 : priority === "medium" ? 100 : 200

    // Use requestIdleCallback for low priority
    if (priority === "low" && "requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(() => setShouldRender(true), { timeout: 3000 })
      return () => {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId)
      }
    }

    const timer = setTimeout(() => setShouldRender(true), delay)
    return () => clearTimeout(timer)
  }, [isVisible, shouldRender, priority])

  // Timeout fallback - ensure we don't stay loading forever
  useEffect(() => {
    if (shouldRender) return

    const timer = setTimeout(() => {
      setShouldRender(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [shouldRender])

  // One shared, visibility-aware scheduler replaces one interval per network
  // per component instance.
  useEffect(() => {
    if (!shouldRender) return

    const unsubscribe = RENDERABLE_NETWORKS
      .filter((network) => !("pageLoadOnly" in network && network.pageLoadOnly))
      .map((network) => subscribeAdRefresh(network.id, (event) => {
        setRefreshCounts((prev) => ({
          ...prev,
          [event.networkId]: event.tick,
        }))
      }, network.refreshInterval))

    return () => unsubscribe.forEach((stop) => stop())
  }, [shouldRender])

  const getLayoutClasses = useCallback(() => {
    // 12-slot grids: 11 networks + 1 c.cx.ua. We bias the column count so the
    // rows are visually balanced (2x6, 3x4, 4x3, 6x2) and ads stay readable.
    switch (layout) {
      case "grid":
        return "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4"
      case "stack":
        return "flex flex-col gap-3"
      case "inline":
        return "flex flex-wrap gap-3"
      default:
        return "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
    }
  }, [layout])

  // Don't render anything while the shared config request is pending.
  if (hasMarketingConsent && configLoading) {
    return <FirstPartyAdSlot placement={position} className={className} />
  }

  // Marketing consent not granted: show a small, honest prompt instead of
  // silently rendering nothing. This matters most on reward pages (PTC,
  // faucet, coupons, shortlinks, games) where these networks are the
  // actual earning mechanism - the visitor needs to understand why no ads
  // (and therefore no reward) are appearing, and how to enable them.
  if (!hasMarketingConsent) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 p-4 text-center text-xs text-muted-foreground",
          className
        )}
      >
        <span>Partner ads are disabled until you enable Marketing cookies.</span>
        <a href="/cookies" className="text-primary hover:underline">
          Manage Cookie Preferences
        </a>
      </div>
    )
  }

  // No third-party network is configured: still render the shell so the
  // FIRST-PARTY slot and the c.cx.ua partner banner keep their placements.
  // Returning null here orphaned the cx-ua banner whenever zero external
  // networks were enabled — the "Sponsored" section silently vanished even
  // though c.cx.ua itself needs no per-network configuration.

  // Show skeleton while lazy loading
  if (!shouldRender) {
    return (
      <div ref={containerRef} className={className}>
        <AdsSkeleton layout={layout} />
      </div>
    )
  }

  // Filter to only enabled networks
  const networksToRender = RENDERABLE_NETWORKS.filter(n => enabledNetworks.includes(n.id))

  // Zero third-party networks configured: render a SINGLE clean c.cx.ua
  // partner banner (where the slot shape allows) instead of an empty-grid
  // graveyard. Multiple instances each show one banner; sidebar/stack shapes
  // skip cx-ua entirely (wrong aspect ratio for a narrow column).
  if (networksToRender.length === 0) {
    if (position === "sidebar" || layout === "stack") {
      return <FirstPartyAdSlot placement={position} className={className} />
    }
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <CxUaBanner variant="card" showLabel className="w-full" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        className
      )}
    >
      {/* Ad disclosure label. Always shown (not gated on the showLabels
          prop) on top of the grid so this block of third-party creative is
          never ambiguous with page content - showLabels only controls the
          extra refresh-indicator styling below it. */}
      <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">Advertisement</div>
      {showLabels && (
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span>Partner Ads</span>
          <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
        </div>
      )}

      <div className={getLayoutClasses()}>
        <FirstPartyAdSlot
          placement={position}
          className="col-span-full"
          width={position === "sidebar" ? 300 : 728}
          height={position === "sidebar" ? 250 : 90}
        />
        {networksToRender.map((network) => (
          <NetworkAdSlot
            key={network.id}
            network={network}
            refreshCount={refreshCounts[network.id] || 0}
            position={position}
            showLabel={showLabels}
            isVisible={shouldRender}
            density={density}
          />
        ))}

        {/* c.cx.ua — wide leaderboard-format creative (~728x90). This
            genuinely cannot be shown correctly inside the 300px-wide
            sidebar slot (layout="stack", position="sidebar"): even at a
            perfectly correct aspect ratio, a 728-wide banner scaled to a
            300px column renders at ~37px tall. There's no CSS fix for
            that — it's the wrong ad shape for that column. So it's
            skipped there entirely and only shown in wide contexts
            (header/footer/content), where it gets the full row width. */}
        {position !== "sidebar" && layout !== "stack" && (
          <div
            className={cn(
              "relative w-full rounded-md overflow-hidden border border-border/40 bg-muted/10 flex items-center justify-center",
              "col-span-full",
              density === "compact"
                ? "min-h-[80px] sm:min-h-[100px]"
                : "min-h-[100px] sm:min-h-[120px]",
              // Hide the slot entirely until/unless a creative actually
              // renders — an empty bordered box reads as broken.
              !cxuaVisible && "hidden"
            )}
            data-ad-network="cx-ua"
            data-ad-position={position}
          >
            <CxUaBanner
              variant="compact"
              showLabel={false}
              className="w-full"
              onVisibilityChange={setCxuaVisible}
            />
          </div>
        )}
      </div>
    </div>
  )
})

// Export individual network component for specific placements
export const SingleNetworkAd = memo(function SingleNetworkAd({
  networkId,
  className,
  size = "medium",
  lazyLoad = true
}: {
  networkId: string
  className?: string
  size?: "small" | "medium" | "large"
  lazyLoad?: boolean
}) {
  const [isVisible, setIsVisible] = useState(!lazyLoad)
  const containerRef = useRef<HTMLDivElement>(null)

  const network = RENDERABLE_NETWORKS.find(n => n.id === networkId)

  useEffect(() => {
    if (!lazyLoad || isVisible || !containerRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px", threshold: 0.01 }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [lazyLoad, isVisible])

  if (!network) return null

  const sizeClasses = {
    small: "w-[160px] h-[90px]",
    medium: "w-[300px] h-[250px]",
    large: "w-[728px] h-[90px]"
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-md overflow-hidden border border-muted-foreground/10",
        sizeClasses[size],
        isVisible ? "bg-muted/30" : "bg-muted/20 animate-pulse",
        className
      )}
      data-ad-network={networkId}
    >
      {isVisible ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className={cn("w-3 h-3 rounded-full", network.color)} />
        </div>
      ) : (
        <div className="w-full h-full" />
      )}
    </div>
  )
})

export default MultiNetworkAds