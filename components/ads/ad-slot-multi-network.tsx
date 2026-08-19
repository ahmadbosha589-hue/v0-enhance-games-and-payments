"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { useAdConfig } from "@/lib/ads/use-ad-config"
import { subscribeAdRefresh } from "@/lib/ads/ad-refresh-bus"
import { isNetworkRenderable } from "@/lib/ads/registry"

// Lazy load heavy components
const Script = dynamic(() => import("next/script").then(mod => mod.default), {
  ssr: false,
})

// Ad network configurations - 11 crypto-friendly partner networks.
//
// IMPORTANT: Google AdSense must NEVER appear in this list. Every call
// site of AdSlotMultiNetwork (support-us reward flow, the fullscreen
// "watch ads to double your reward" modal, PTC watch, shortlinks
// go/reward, and the shortlink monetization landing page) is an
// incentivized-ads surface, and Google's Rewarded Ads policy prohibits
// offering a reward - including cryptocurrency - in exchange for viewing
// or clicking AdSense creative. A "google" entry used to sit at index 0
// here, which meant it was ALSO the default ad rendered on first paint
// (currentNetworkIndex starts at 0) on every one of those pages, not
// just an occasional rotation. Real AdSense only belongs in
// <AdsenseBanner />, used exclusively for plain, non-incentivized
// placements (see components/ads/adsense-banner.tsx).
const AD_NETWORKS = [
  { id: "a-ads", name: "A-ADS", priority: 1 },
  { id: "coinzilla", name: "CoinZilla", priority: 2 },
  { id: "bitmedia", name: "Bitmedia", priority: 3 },
  { id: "cointraffic", name: "Cointraffic", priority: 4 },
  { id: "medianet", name: "Media.net", priority: 5 },
  { id: "hilltopads", name: "HilltopAds", priority: 6 },
  { id: "adsterra", name: "Adsterra", priority: 7 },
  { id: "propellerads", name: "PropellerAds", priority: 8 },
  { id: "trafficstars", name: "TrafficStars", priority: 9 },
  { id: "mellowads", name: "MellowAds", priority: 10 },
  { id: "adskeeper", name: "AdsKeeper", priority: 11 },
] as const

const RENDERABLE_NETWORKS = AD_NETWORKS.filter((network) => isNetworkRenderable(network.id))

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

export const AdSlotMultiNetwork = memo(function AdSlotMultiNetwork({ 
  position, 
  size, 
  className,
  refreshInterval = 30000,
  priority = "medium",
  lazyLoad = true,
}: AdSlotMultiNetworkProps) {
  const [currentNetworkIndex, setCurrentNetworkIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(!lazyLoad || priority === "high")
  const [shouldRender, setShouldRender] = useState(!lazyLoad || priority === "high")
  const [adError, setAdError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasMarketingConsent = useAdConsent()
  const { configs: adConfigs, isLoading: configLoading } = useAdConfig(hasMarketingConsent)
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

  // Rotate through partner networks using the shared visibility-aware bus.
  useEffect(() => {
    if (!shouldRender || !adConfigs || configLoading) return

    return subscribeAdRefresh(`slot:${position}`, () => {
      setCurrentNetworkIndex((prev) => (prev + 1) % RENDERABLE_NETWORKS.length)
    }, refreshInterval)
  }, [position, refreshInterval, shouldRender, adConfigs, configLoading])

  const handleAdError = useCallback(() => {
    setAdError(true)
    setCurrentNetworkIndex(prev => (prev + 1) % RENDERABLE_NETWORKS.length)
    setTimeout(() => setAdError(false), 100)
  }, [])

  if (!hasMarketingConsent || RENDERABLE_NETWORKS.length === 0) return null

  const currentNetwork = RENDERABLE_NETWORKS[currentNetworkIndex]
  const config = adConfigs?.[currentNetwork.id] as Record<string, unknown> | undefined

  // Render ad content
  const renderAdContent = useCallback(() => {
    if (!shouldRender) {
      return <AdSkeleton height={sizeConfig.height} />
    }

    if (!config || !(config as { enabled?: boolean }).enabled) {
      if (currentNetworkIndex < RENDERABLE_NETWORKS.length - 1) {
        // Use microtask to avoid setState during render
        queueMicrotask(handleAdError)
      }
      return <AdSkeleton height={sizeConfig.height} />
    }

    const configTyped = config as Record<string, string | undefined>

    switch (currentNetwork.id) {
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

  if (!hasMarketingConsent) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded bg-muted/10 border border-dashed border-border/60 text-[10px] text-muted-foreground text-center px-2",
          sizeConfig.class,
          "mx-auto",
          className
        )}
      >
        Enable Marketing cookies to view partner ads
      </div>
    )
  }

  return (
    <>
      {renderScripts()}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Advertisement</span>
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
      </div>
    </>
  )
})

export default AdSlotMultiNetwork
