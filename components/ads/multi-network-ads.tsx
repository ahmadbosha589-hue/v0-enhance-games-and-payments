"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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
}

export function MultiNetworkAds({ 
  className, 
  position = "content",
  layout = "grid",
  showLabels = false
}: MultiNetworkAdsProps) {
  const [refreshCounts, setRefreshCounts] = useState<Record<string, number>>({})
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const mountTimeRef = useRef(Date.now())

  // Track visibility
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Setup auto-refresh for each network
  useEffect(() => {
    if (!isVisible) return

    AD_NETWORKS.forEach(network => {
      // Skip AdsKeeper - it only refreshes on page load
      if (network.pageLoadOnly || network.refreshInterval === 0) return

      // Clear existing interval if any
      const existingInterval = intervalsRef.current.get(network.id)
      if (existingInterval) clearInterval(existingInterval)

      // Set new interval for auto-refresh
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
  }, [isVisible])

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
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-lg border bg-muted/20 p-3 sm:p-4",
        className
      )}
    >
      {/* Subtle header */}
      {showLabels && (
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span>Partner Ads</span>
          <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
        </div>
      )}

      {/* Ad Network Slots */}
      <div className={getLayoutClasses()}>
        {AD_NETWORKS.map((network) => (
          <NetworkAdSlot
            key={network.id}
            network={network}
            refreshCount={refreshCounts[network.id] || 0}
            position={position}
            showLabel={showLabels}
          />
        ))}
      </div>
    </div>
  )
}

interface NetworkAdSlotProps {
  network: typeof AD_NETWORKS[number]
  refreshCount: number
  position: string
  showLabel?: boolean
}

function NetworkAdSlot({ network, refreshCount, position, showLabel }: NetworkAdSlotProps) {
  const [isLoading, setIsLoading] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)

  // Trigger refresh animation when count changes
  useEffect(() => {
    if (refreshCount === 0) return
    
    setIsLoading(true)
    const timeout = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timeout)
  }, [refreshCount])

  // Simulate ad content loading
  useEffect(() => {
    if (!slotRef.current) return

    // In production, this would load actual ad scripts
    // For now, we're creating placeholder slots that would be replaced by real ads
    const adConfig = {
      network: network.id,
      position,
      refreshKey: refreshCount,
      timestamp: Date.now(),
    }

    // Store config on element for ad scripts to read
    slotRef.current.dataset.adConfig = JSON.stringify(adConfig)
  }, [network.id, position, refreshCount])

  return (
    <div
      ref={slotRef}
      className={cn(
        "relative aspect-[4/3] sm:aspect-video rounded-md overflow-hidden transition-all duration-300",
        "border border-muted-foreground/10 bg-muted/30",
        isLoading && "opacity-50 scale-95"
      )}
      data-ad-network={network.id}
      data-ad-position={position}
      data-refresh-count={refreshCount}
      data-page-load-only={network.pageLoadOnly || false}
    >
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Ad placeholder - would be replaced by actual ad content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
        <div className={cn("w-2 h-2 rounded-full mb-1", network.color)} />
        {showLabel && (
          <span className="text-[8px] text-muted-foreground text-center leading-tight">
            {network.name}
          </span>
        )}
      </div>

      {/* Actual ad container - scripts would inject here */}
      <div 
        className="absolute inset-0"
        id={`ad-${network.id}-${position}`}
        data-ad-slot={`${network.id}-${position}`}
      />
    </div>
  )
}

// Export individual network component for specific placements
export function SingleNetworkAd({ 
  networkId, 
  className,
  size = "medium"
}: { 
  networkId: string
  className?: string
  size?: "small" | "medium" | "large"
}) {
  const network = AD_NETWORKS.find(n => n.id === networkId)
  if (!network) return null

  const sizeClasses = {
    small: "w-[160px] h-[90px]",
    medium: "w-[300px] h-[250px]",
    large: "w-[728px] h-[90px]"
  }

  return (
    <div 
      className={cn(
        "rounded-md overflow-hidden border border-muted-foreground/10 bg-muted/30",
        sizeClasses[size],
        className
      )}
      data-ad-network={networkId}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div className={cn("w-3 h-3 rounded-full", network.color)} />
      </div>
    </div>
  )
}
