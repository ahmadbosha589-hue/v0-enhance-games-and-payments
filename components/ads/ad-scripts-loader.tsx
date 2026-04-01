"use client"

import { useEffect, useCallback, useRef } from "react"
import Script from "next/script"

interface AdConfig {
  googleAdsenseId?: string
  aAdsWalletId?: string
  coinzillaPublisherId?: string
  bitmediaZoneId?: string
  cointrafficPublisherId?: string
  medianetCustomerId?: string
  hilltopadsPublisherId?: string
  adsterraPublisherId?: string
  propelleradsZoneId?: string
  trafficstarsSpotId?: string
  mellowadsZoneId?: string
  adskeeperWidgetId?: string
}

/**
 * AdScriptsLoader - Loads all 12 ad network scripts asynchronously
 * Google Ads are static (60s), other networks auto-refresh on completion
 * AdsKeeper only refreshes on page load per their policy
 */
export function AdScriptsLoader({ config }: { config: AdConfig }) {
  const loadedRef = useRef<Set<string>>(new Set())
  const refreshIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Initialize Google AdSense (static, no refresh)
  const initGoogleAds = useCallback(() => {
    if (!config.googleAdsenseId || loadedRef.current.has("google")) return
    
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({})
      loadedRef.current.add("google")
    } catch (e) {
      console.warn("[v0] Google Ads init failed:", e)
    }
  }, [config.googleAdsenseId])

  // Initialize other ad networks with auto-refresh
  const initAdNetworks = useCallback(() => {
    // A-ADS
    if (config.aAdsWalletId && !loadedRef.current.has("a-ads")) {
      const script = document.createElement("script")
      script.src = `https://a-ads.com/ad/${config.aAdsWalletId}.js`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("a-ads")
    }

    // CoinZilla
    if (config.coinzillaPublisherId && !loadedRef.current.has("coinzilla")) {
      const script = document.createElement("script")
      script.src = "https://coinzilla.com/lib/display.js"
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("coinzilla")
    }

    // BitMedia
    if (config.bitmediaZoneId && !loadedRef.current.has("bitmedia")) {
      const script = document.createElement("script")
      script.src = `https://ad.bitmedia.io/js/adbybm.js?v=${Date.now()}`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("bitmedia")
    }

    // CoinTraffic
    if (config.cointrafficPublisherId && !loadedRef.current.has("cointraffic")) {
      const script = document.createElement("script")
      script.src = "https://cointraffic.io/ads/ads.js"
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("cointraffic")
    }

    // Media.net
    if (config.medianetCustomerId && !loadedRef.current.has("medianet")) {
      const script = document.createElement("script")
      script.src = `https://contextual.media.net/dmedianet.js?cid=${config.medianetCustomerId}`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("medianet")
    }

    // HilltopAds
    if (config.hilltopadsPublisherId && !loadedRef.current.has("hilltopads")) {
      const script = document.createElement("script")
      script.src = `https://js.hilltopads.com/${config.hilltopadsPublisherId}.js`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("hilltopads")
    }

    // Adsterra
    if (config.adsterraPublisherId && !loadedRef.current.has("adsterra")) {
      const script = document.createElement("script")
      script.src = `https://www.adsteera.com/display.js?id=${config.adsterraPublisherId}`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("adsterra")
    }

    // PropellerAds
    if (config.propelleradsZoneId && !loadedRef.current.has("propellerads")) {
      const script = document.createElement("script")
      script.src = `https://propu.sh/${config.propelleradsZoneId}.js`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("propellerads")
    }

    // TrafficStars
    if (config.trafficstarsSpotId && !loadedRef.current.has("trafficstars")) {
      const script = document.createElement("script")
      script.src = `https://tsyndicate.com/api/v2/scripts/${config.trafficstarsSpotId}`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("trafficstars")
    }

    // MellowAds
    if (config.mellowadsZoneId && !loadedRef.current.has("mellowads")) {
      const script = document.createElement("script")
      script.src = `https://mellowads.com/display.js?zone=${config.mellowadsZoneId}`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("mellowads")
    }

    // AdsKeeper - only loads on page load, doesn't refresh
    if (config.adskeeperWidgetId && !loadedRef.current.has("adskeeper")) {
      const script = document.createElement("script")
      script.src = `https://jsc.adskeeper.co.uk/site/${config.adskeeperWidgetId}.js`
      script.async = true
      document.body.appendChild(script)
      loadedRef.current.add("adskeeper")
    }
  }, [config])

  // Setup auto-refresh for networks (except Google and AdsKeeper)
  const setupAutoRefresh = useCallback(() => {
    const refreshIntervals: Record<string, number> = {
      "a-ads": 30000,
      "coinzilla": 45000,
      "bitmedia": 40000,
      "cointraffic": 35000,
      "medianet": 50000,
      "hilltopads": 30000,
      "adsterra": 45000,
      "propellerads": 40000,
      "trafficstars": 35000,
      "mellowads": 50000,
      // "adskeeper" - no auto-refresh, only page load
    }

    Object.entries(refreshIntervals).forEach(([network, interval]) => {
      if (refreshIntervalsRef.current.has(network)) return

      const timer = setInterval(() => {
        // Find all ad slots for this network and trigger refresh
        const slots = document.querySelectorAll(`[data-ad-network="${network}"]`)
        slots.forEach(slot => {
          const currentCount = parseInt(slot.getAttribute("data-refresh-count") || "0")
          slot.setAttribute("data-refresh-count", String(currentCount + 1))
          
          // Trigger custom event for refresh
          slot.dispatchEvent(new CustomEvent("adRefresh", { 
            detail: { network, count: currentCount + 1 }
          }))
        })
      }, interval)

      refreshIntervalsRef.current.set(network, timer)
    })
  }, [])

  useEffect(() => {
    // Wait for page to be interactive before loading ads
    if (document.readyState === "complete") {
      initGoogleAds()
      initAdNetworks()
      setupAutoRefresh()
    } else {
      window.addEventListener("load", () => {
        initGoogleAds()
        initAdNetworks()
        setupAutoRefresh()
      })
    }

    return () => {
      // Cleanup intervals on unmount
      refreshIntervalsRef.current.forEach(timer => clearInterval(timer))
      refreshIntervalsRef.current.clear()
    }
  }, [initGoogleAds, initAdNetworks, setupAutoRefresh])

  return (
    <>
      {/* Google AdSense - static, no refresh */}
      {config.googleAdsenseId && (
        <Script
          id="google-adsense"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.googleAdsenseId}`}
          strategy="lazyOnload"
          crossOrigin="anonymous"
          onLoad={initGoogleAds}
        />
      )}
    </>
  )
}

/**
 * Refreshes a specific ad network's slots
 */
export function refreshAdNetwork(networkId: string) {
  const slots = document.querySelectorAll(`[data-ad-network="${networkId}"]`)
  slots.forEach(slot => {
    const currentCount = parseInt(slot.getAttribute("data-refresh-count") || "0")
    slot.setAttribute("data-refresh-count", String(currentCount + 1))
    slot.dispatchEvent(new CustomEvent("adRefresh", { 
      detail: { network: networkId, count: currentCount + 1 }
    }))
  })
}

/**
 * Gets current ad config from admin settings
 */
export async function getAdConfig(): Promise<AdConfig> {
  try {
    const response = await fetch("/api/ads/config", { 
      cache: "force-cache",
      next: { revalidate: 3600 } // Revalidate every hour
    })
    if (!response.ok) return {}
    return response.json()
  } catch {
    return {}
  }
}
