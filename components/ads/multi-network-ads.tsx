"use client"

import { useEffect, useState, useRef, useCallback, memo } from "react"
import { cn } from "@/lib/utils"
import { RefreshCw } from "lucide-react"

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

interface MultiNetworkAdsProps {
  className?: string
  position?: "header" | "sidebar" | "content" | "footer"
  layout?: "grid" | "stack" | "inline"
  showLabels?: boolean
  lazyLoad?: boolean
  priority?: "high" | "medium" | "low"
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
        {AD_NETWORKS.map((network) => (
          <div
            key={network.id}
            className="aspect-[4/3] sm:aspect-video rounded-md bg-muted/50"
          />
        ))}
      </div>
    </div>
  )
})

// Memoized network ad slot - hidden placeholder for real ad injection
// Only becomes visible when ad scripts populate content
const NetworkAdSlot = memo(function NetworkAdSlot({
  network,
  refreshCount,
  position,
  isVisible
}: {
  network: typeof AD_NETWORKS[number]
  refreshCount: number
  position: string
  showLabel?: boolean
  isVisible: boolean
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [hasAdContent, setHasAdContent] = useState(false)

  // Check if ad content has been injected
  useEffect(() => {
    if (!slotRef.current || !isVisible) return

    const adConfig = {
      network: network.id,
      position,
      refreshKey: refreshCount,
      timestamp: Date.now(),
    }

    slotRef.current.dataset.adConfig = JSON.stringify(adConfig)

    // Observe for ad content being injected
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          setHasAdContent(true)
          observer.disconnect()
          break
        }
      }
    })

    const adSlot = document.getElementById(`ad-${network.id}-${position}`)
    if (adSlot) {
      // Check if already has content
      if (adSlot.children.length > 0 || adSlot.innerHTML.trim() !== '') {
        setHasAdContent(true)
      } else {
        observer.observe(adSlot, { childList: true, subtree: true })
      }
    }

    return () => observer.disconnect()
  }, [network.id, position, refreshCount, isVisible])

  // Hidden until ad content is injected - prevents empty placeholder grid
  if (!hasAdContent) {
    return (
      <div
        ref={slotRef}
        className="hidden"
        data-ad-network={network.id}
        data-ad-position={position}
        data-refresh-count={refreshCount}
        data-page-load-only={network.pageLoadOnly || false}
      >
        <div
          id={`ad-${network.id}-${position}`}
          data-ad-slot={`${network.id}-${position}`}
        />
      </div>
    )
  }

  return (
    <div
      ref={slotRef}
      className="relative rounded-md overflow-hidden"
      data-ad-network={network.id}
      data-ad-position={position}
      data-refresh-count={refreshCount}
      data-page-load-only={network.pageLoadOnly || false}
    >
      <div
        className="w-full"
        id={`ad-${network.id}-${position}`}
        data-ad-slot={`${network.id}-${position}`}
      />
    </div>
  )
})

export const MultiNetworkAds = memo(function MultiNetworkAds({
  className,
  position = "content",
  layout = "grid",
  showLabels = false,
  lazyLoad = true,
  priority = "medium"
}: MultiNetworkAdsProps) {
  const [refreshCounts, setRefreshCounts] = useState<Record<string, number>>({})
  const [isVisible, setIsVisible] = useState(!lazyLoad || priority === "high")
  const [shouldRender, setShouldRender] = useState(!lazyLoad || priority === "high")
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

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

  // Setup auto-refresh for each network - only when fully rendered
  useEffect(() => {
    if (!shouldRender) return

    AD_NETWORKS.forEach(network => {
      // Skip AdsKeeper - it only refreshes on page load
      if (network.pageLoadOnly || network.refreshInterval === 0) return

      const existingInterval = intervalsRef.current.get(network.id)
      if (existingInterval) clearInterval(existingInterval)

      const interval = setInterval(() => {
        setRefreshCounts(prev => ({
          ...prev,
          [network.id]: (prev[network.id] || 0) + 1
        }))
      }, network.refreshInterval)

      intervalsRef.current.set(network.id, interval)
    })

    return () => {
      intervalsRef.current.forEach(interval => clearInterval(interval))
      intervalsRef.current.clear()
    }
  }, [shouldRender])

  const getLayoutClasses = useCallback(() => {
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
  }, [layout])

  // Show skeleton while lazy loading
  if (!shouldRender) {
    return (
      <div ref={containerRef} className={className}>
        <AdsSkeleton layout={layout} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-lg border bg-muted/20 p-3 sm:p-4",
        className
      )}
    >
      {showLabels && (
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span>Partner Ads</span>
          <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
        </div>
      )}

      <div className={getLayoutClasses()}>
        {AD_NETWORKS.map((network) => (
          <NetworkAdSlot
            key={network.id}
            network={network}
            refreshCount={refreshCounts[network.id] || 0}
            position={position}
            showLabel={showLabels}
            isVisible={shouldRender}
          />
        ))}
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

  const network = AD_NETWORKS.find(n => n.id === networkId)

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
