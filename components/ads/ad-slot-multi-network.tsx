"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import Script from "next/script"

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
  refreshInterval?: number // ms - for rotating non-Google ads
}

// Size configurations
const SIZE_CONFIG: Record<AdSize, { width: number; height: number; class: string }> = {
  banner: { width: 468, height: 60, class: "h-[60px] w-full max-w-[468px]" },
  rectangle: { width: 300, height: 250, class: "h-[250px] w-full max-w-[300px]" },
  leaderboard: { width: 728, height: 90, class: "h-[90px] w-full max-w-[728px]" },
  skyscraper: { width: 160, height: 600, class: "h-[600px] w-full max-w-[160px]" },
  "large-rectangle": { width: 336, height: 280, class: "h-[280px] w-full max-w-[336px]" },
}

export function AdSlotMultiNetwork({ 
  position, 
  size, 
  className,
  refreshInterval = 30000 // Rotate every 30s for non-Google ads
}: AdSlotMultiNetworkProps) {
  const [currentNetworkIndex, setCurrentNetworkIndex] = useState(0)
  const [adConfigs, setAdConfigs] = useState<Record<string, any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [adError, setAdError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch ad network configurations from API
  useEffect(() => {
    async function fetchConfigs() {
      try {
        const res = await fetch("/api/ads/config")
        if (res.ok) {
          const data = await res.json()
          setAdConfigs(data.configs)
        }
      } catch (e) {
        console.warn("[v0] Failed to fetch ad configs")
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfigs()
  }, [])

  // Rotate through non-Google ads
  useEffect(() => {
    // Don't rotate if Google is the current network (Google must be static per policy)
    const currentNetwork = AD_NETWORKS[currentNetworkIndex]
    if (currentNetwork.id === "google") return

    refreshTimerRef.current = setInterval(() => {
      setCurrentNetworkIndex(prev => {
        const next = (prev + 1) % AD_NETWORKS.length
        // Skip Google in rotation (always static)
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
  }, [currentNetworkIndex, refreshInterval])

  // Handle ad error - try next network
  const handleAdError = useCallback(() => {
    setAdError(true)
    // Move to next network
    setCurrentNetworkIndex(prev => (prev + 1) % AD_NETWORKS.length)
    setTimeout(() => setAdError(false), 100)
  }, [])

  const sizeConfig = SIZE_CONFIG[size]
  const currentNetwork = AD_NETWORKS[currentNetworkIndex]
  const config = adConfigs?.[currentNetwork.id]

  // Render specific ad network
  const renderAdContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full bg-muted/50 animate-pulse">
          <span className="text-xs text-muted-foreground">Loading ad...</span>
        </div>
      )
    }

    if (!config?.enabled) {
      // Try next network if current is not configured
      if (currentNetworkIndex < AD_NETWORKS.length - 1) {
        setTimeout(() => handleAdError(), 0)
      }
      return (
        <div className="flex items-center justify-center h-full bg-muted/30">
          <span className="text-xs text-muted-foreground">Ad</span>
        </div>
      )
    }

    switch (currentNetwork.id) {
      case "google":
        // Google AdSense - static, no refresh per policy
        return (
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%", height: "100%" }}
            data-ad-client={config.publisherId}
            data-ad-slot={config.adSlots?.[position] || config.defaultSlot}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        )

      case "a-ads":
        return (
          <iframe
            data-aa={config.publisherId}
            src={`//ad.a-ads.com/${config.publisherId}?size=${sizeConfig.width}x${sizeConfig.height}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height, border: 0, padding: 0, overflow: "hidden", backgroundColor: "transparent" }}
            onError={handleAdError}
          />
        )

      case "coinzilla":
        return (
          <div 
            className="coinzilla" 
            data-zone={config.zoneId}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "bitmedia":
        return (
          <iframe
            src={`https://bitmedia.io/embed/${config.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            onError={handleAdError}
          />
        )

      case "cointraffic":
        return (
          <div 
            id={`ct_${config.zoneId}_${position}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "medianet":
        return (
          <div id={`medianet_${position}`}>
            <div 
              id={config.cid}
              data-cid={config.cid}
              data-crid={config.crid}
              style={{ width: sizeConfig.width, height: sizeConfig.height }}
            />
          </div>
        )

      case "hilltopads":
        return (
          <iframe
            src={`https://hilltopads.com/show/${config.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            onError={handleAdError}
          />
        )

      case "adsterra":
        return (
          <div
            data-ad-client={config.publisherId}
            data-ad-slot={config.slotId}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "propellerads":
        return (
          <div 
            id={`propad_${config.zoneId}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      case "trafficstars":
        return (
          <iframe
            src={`https://tsyndicate.com/embed/${config.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            onError={handleAdError}
          />
        )

      case "mellowads":
        return (
          <iframe
            data-mellow-ad={config.zoneId}
            src={`https://mellowads.com/ad/${config.zoneId}`}
            width={sizeConfig.width}
            height={sizeConfig.height}
            frameBorder="0"
            scrolling="no"
            onError={handleAdError}
          />
        )

      case "adskeeper":
        return (
          <div 
            id={`adskeeper_${config.widgetId}`}
            style={{ width: sizeConfig.width, height: sizeConfig.height }}
          />
        )

      default:
        return (
          <div className="flex items-center justify-center h-full bg-muted/30">
            <span className="text-xs text-muted-foreground">Advertisement</span>
          </div>
        )
    }
  }

  return (
    <>
      {/* Google AdSense Script - only load once */}
      {currentNetwork.id === "google" && config?.enabled && (
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisherId}`}
          crossOrigin="anonymous"
          strategy="lazyOnload"
        />
      )}

      {/* CoinZilla Script */}
      {currentNetwork.id === "coinzilla" && config?.enabled && (
        <Script
          src="https://coinzillatag.com/lib/display.js"
          strategy="lazyOnload"
        />
      )}

      {/* Cointraffic Script */}
      {currentNetwork.id === "cointraffic" && config?.enabled && (
        <Script
          src={`https://cointraffic.io/js/${config.publisherId}.js`}
          strategy="lazyOnload"
        />
      )}

      {/* Media.net Script */}
      {currentNetwork.id === "medianet" && config?.enabled && (
        <Script
          src={`https://contextual.media.net/dmedianet.js?cid=${config.cid}`}
          strategy="lazyOnload"
        />
      )}

      {/* AdsKeeper Script */}
      {currentNetwork.id === "adskeeper" && config?.enabled && (
        <Script
          src={`https://jsc.adskeeper.com/site/${config.siteId}.js`}
          strategy="lazyOnload"
        />
      )}

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
      >
        {renderAdContent()}
      </div>
    </>
  )
}
