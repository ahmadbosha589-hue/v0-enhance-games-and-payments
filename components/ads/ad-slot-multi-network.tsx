"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"

// Lazy load heavy components
const Script = dynamic(() => import("next/script").then(mod => mod.default), {
  ssr: false,
})

// Ad network configurations - 12 networks for maximum profit
const AD_NETWORKS = [
  { id: "google", name: "Google AdSense", priority: 1 },
  { id: "a-ads", name: "A-ADS", priority: 2 },
  { id: "coinzilla", name: "CoinZilla", priority: 3 },
  { id: "bitmedia", name: "Bitmedia", priority: 4 },
  { id: "cointraffic", name: "Cointraffic", priority: 5 },
  { id: "medianet", name: "Media.net", priority: 6 },
  { id: "hilltopads", name: "HilltopAds", priority: 7 },
  { id: "adsterra", name: "Adsterra", priority: 8 },
  { id: "propellerads", name: "PropellerAds", priority: 9 },
  { id: "trafficstars", name: "TrafficStars", priority: 10 },
  { id: "mellowads", name: "MellowAds", priority: 11 },
  { id: "adskeeper", name: "AdsKeeper", priority: 12 },
] as const

type AdSize = "banner" | "rectangle" | "leaderboard" | "skyscraper" | "large-rectangle"
type AdPosition = "header" | "sidebar" | "content" | "footer"

interface AdSlotMultiNetworkProps {
  position: AdPosition
  size: AdSize
  className?: string
  refreshInterval?: number
  priority?: "high" | "medium" | "low"
  lazyLoad?: boolean
}

// Size configurations
const SIZE_CONFIG: Record<AdSize, { width: number; height: number; class: string }> = {
  banner: { width: 468, height: 60, class: "h-[60px] w-full max-w-[468px]" },
  rectangle: { width: 300, height: 250, class: "h-[250px] w-full max-w-[300px]" },
  leaderboard: { width: 728, height: 90, class: "h-[90px] w-full max-w-[728px]" },
  skyscraper: { width: 160, height: 600, class: "h-[600px] w-full max-w-[160px]" },
  "large-rectangle": { width: 336, height: 280, class: "h-[280px] w-full max-w-[336px]" },
}

// Skeleton placeholder for lazy loading
const AdSkeleton = memo(function AdSkeleton({ height }: { height: number }) {
  return (
    <div 
      className="bg-muted/30 animate-pulse flex items-center justify-center rounded"
      style={{ height }}
    >
      <span className="text-[10px] text-muted-foreground/40">Ad</span>
    </div>
  )
})

// Cache for ad configs to avoid refetching
let configCache: Record<string, unknown> | null = null
let configFetchPromise: Promise<Record<string, unknown>> | null = null

async function getAdConfigs(): Promise<Record<string, unknown>> {
  if (configCache) return configCache
  
  if (configFetchPromise) return configFetchPromise
  
  configFetchPromise = fetch("/api/ads/config", {
    // Use cache for performance
    next: { revalidate: 300 }, // 5 min cache
  })
    .then(res => res.ok ? res.json() : { configs: {} })
    .then(data => {
      configCache = data.configs || {}
      return configCache
    })
    .catch(() => ({}))
  
  return configFetchPromise
}

export const AdSlotMultiNetwork = memo(function AdSlotMultiNetwork({ 
  position, 
  size, 
  className,
  refreshInterval = 30000,
  priority = "medium",
  lazyLoad = true,
}: AdSlotMultiNetworkProps) {
  const [currentNetworkIndex, setCurrentNetworkIndex] = useState(0)
  const [adConfigs, setAdConfigs] = useState<Record<string, unknown> | null>(configCache)
  const [isVisible, setIsVisible] = useState(!lazyLoad || priority === "high")
  const [shouldRender, setShouldRender] = useState(!lazyLoad || priority === "high")
  const [adError, setAdError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const sizeConfig = SIZE_CONFIG[size]

  // Lazy load with Intersection Observer
  useEffect(() => {
    if (!lazyLoad || priority === "high" || isVisible) return
    
    const element = containerRef.current
    if (!element) return

    // Check if already in viewport
    const rect = element.getBoundingClientRect()
    if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
      setIsVisible(true)
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true)
          observerRef.current?.disconnect()
        }
      },
      { 
        rootMargin: "300px", // Start loading 300px before visible
        threshold: 0.01 
      }
    )

    observerRef.current.observe(element)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [lazyLoad, priority, isVisible])

  // Delayed render for non-high priority
  useEffect(() => {
    if (!isVisible || shouldRender) return

    const delay = priority === "medium" ? 50 : 150

    // Use requestIdleCallback for low priority
    if (priority === "low" && "requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(() => setShouldRender(true), { timeout: 2000 })
      return () => {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId)
      }
    }

    const timer = setTimeout(() => setShouldRender(true), delay)
    return () => clearTimeout(timer)
  }, [isVisible, shouldRender, priority])

  // Fetch ad configs asynchronously
  useEffect(() => {
    if (!shouldRender) return
    
    getAdConfigs().then(setAdConfigs)
  }, [shouldRender])

  // Rotate through non-Google ads
  useEffect(() => {
    if (!shouldRender || !adConfigs) return
    
    const currentNetwork = AD_NETWORKS[currentNetworkIndex]
    if (currentNetwork.id === "google") return

    refreshTimerRef.current = setInterval(() => {
      setCurrentNetworkIndex(prev => {
        const next = (prev + 1) % AD_NETWORKS.length
        if (AD_NETWORKS[next].id === "google") {
          return (next + 1) % AD_NETWORKS.length
        }
        return next
      })
    }, refreshInterval)

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [currentNetworkIndex, refreshInterval, shouldRender, adConfigs])

  const handleAdError = useCallback(() => {
    setAdError(true)
    setCurrentNetworkIndex(prev => (prev + 1) % AD_NETWORKS.length)
    setTimeout(() => setAdError(false), 100)
  }, [])

  const currentNetwork = AD_NETWORKS[currentNetworkIndex]
  const config = adConfigs?.[currentNetwork.id] as Record<string, unknown> | undefined

  // Render ad content
  const renderAdContent = useCallback(() => {
    if (!shouldRender) {
      return <AdSkeleton height={sizeConfig.height} />
    }

    if (!config || !(config as { enabled?: boolean }).enabled) {
      if (currentNetworkIndex < AD_NETWORKS.length - 1) {
        // Use microtask to avoid setState during render
        queueMicrotask(handleAdError)
      }
      return <AdSkeleton height={sizeConfig.height} />
    }

    const configTyped = config as Record<string, string | undefined>

    switch (currentNetwork.id) {
      case "google":
        return (
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%", height: "100%" }}
            data-ad-client={configTyped.publisherId}
            data-ad-slot={configTyped.defaultSlot}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        )

      case "a-ads":
        return (
          <iframe
            data-aa={configTyped.publisherId}
            src={`//ad.a-ads.com/${configTyped.publisherId}?size=${sizeConfig.width}x${sizeConfig.height}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height, border: 0, padding: 0, overflow: "hidden", backgroundColor: "transparent" }}
            loading="lazy"
            onError={handleAdError}
          />
        )

      case "coinzilla":
        return (
          <div 
            className="coinzilla" 
            data-zone={configTyped.zoneId}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "bitmedia":
        return (
          <iframe
            src={`https://bitmedia.io/embed/${configTyped.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            loading="lazy"
            onError={handleAdError}
          />
        )

      case "cointraffic":
        return (
          <div 
            id={`ct_${configTyped.zoneId}_${position}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "medianet":
        return (
          <div id={`medianet_${position}`}>
            <div 
              id={configTyped.cid}
              data-cid={configTyped.cid}
              data-crid={configTyped.crid}
              style={{ width: sizeConfig.width, height: sizeConfig.height }}
            />
          </div>
        )

      case "hilltopads":
        return (
          <iframe
            src={`https://hilltopads.com/show/${configTyped.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            loading="lazy"
            onError={handleAdError}
          />
        )

      case "adsterra":
        return (
          <div
            data-ad-client={configTyped.publisherId}
            data-ad-slot={configTyped.slotId}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "propellerads":
        return (
          <div 
            id={`propad_${configTyped.zoneId}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "trafficstars":
        return (
          <iframe
            src={`https://tsyndicate.com/embed/${configTyped.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            loading="lazy"
            onError={handleAdError}
          />
        )

      case "mellowads":
        return (
          <iframe
            data-mellow-ad={configTyped.zoneId}
            src={`https://mellowads.com/ad/${configTyped.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            loading="lazy"
            onError={handleAdError}
          />
        )

      case "adskeeper":
        return (
          <div 
            id={`adskeeper_${configTyped.widgetId}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      default:
        return <AdSkeleton height={sizeConfig.height} />
    }
  }, [shouldRender, config, currentNetwork.id, currentNetworkIndex, sizeConfig, position, handleAdError])

  // Render scripts only when needed and visible
  const renderScripts = useCallback(() => {
    if (!shouldRender || !config || !(config as { enabled?: boolean }).enabled) return null

    const configTyped = config as Record<string, string | undefined>

    return (
      <>
        {currentNetwork.id === "google" && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${configTyped.publisherId}`}
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}
        {currentNetwork.id === "coinzilla" && (
          <Script src="https://coinzillatag.com/lib/display.js" strategy="lazyOnload" />
        )}
        {currentNetwork.id === "cointraffic" && (
          <Script src={`https://cointraffic.io/js/${configTyped.publisherId}.js`} strategy="lazyOnload" />
        )}
        {currentNetwork.id === "medianet" && (
          <Script src={`https://contextual.media.net/dmedianet.js?cid=${configTyped.cid}`} strategy="lazyOnload" />
        )}
        {currentNetwork.id === "adskeeper" && (
          <Script src={`https://jsc.adskeeper.com/site/${configTyped.siteId}.js`} strategy="lazyOnload" />
        )}
      </>
    )
  }, [shouldRender, config, currentNetwork.id])

  return (
    <>
      {renderScripts()}
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden",
          sizeConfig.class,
          "mx-auto",
          adError && "opacity-50",
          className
        )}
        data-ad-position={position}
        data-ad-size={size}
        data-ad-network={currentNetwork.id}
        data-ad-lazy={lazyLoad}
      >
        {renderAdContent()}
      </div>
    </>
  )
})

export default AdSlotMultiNetwork
