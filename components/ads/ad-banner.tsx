"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type AdProvider = "aads" | "coinzilla" | "bitsmedia"
export type AdSize = "banner" | "leaderboard" | "rectangle" | "skyscraper" | "mobile"

interface AdBannerProps {
  provider: AdProvider
  size: AdSize
  className?: string
  // A-ADS specific
  aadsId?: string
  // Coinzilla specific
  coinzillaZone?: string
  // Bitsmedia specific
  bitsmediaId?: string
  bitsmediaSlot?: string
}

const AD_SIZES: Record<AdSize, { width: number; height: number }> = {
  banner: { width: 468, height: 60 },
  leaderboard: { width: 728, height: 90 },
  rectangle: { width: 300, height: 250 },
  skyscraper: { width: 160, height: 600 },
  mobile: { width: 320, height: 50 },
}

export function AdBanner({
  provider,
  size,
  className,
  aadsId,
  coinzillaZone,
  bitsmediaId,
  bitsmediaSlot,
}: AdBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const dimensions = AD_SIZES[size]

  useEffect(() => {
    if (!containerRef.current) return

    const loadAd = async () => {
      try {
        switch (provider) {
          case "aads":
            if (aadsId) {
              // A-ADS embed script
              const aadsScript = document.createElement("script")
              aadsScript.src = `https://a-ads.com/1t.js`
              aadsScript.async = true
              aadsScript.setAttribute("data-aa", aadsId)
              aadsScript.setAttribute("data-width", dimensions.width.toString())
              aadsScript.setAttribute("data-height", dimensions.height.toString())
              containerRef.current?.appendChild(aadsScript)
            }
            break

          case "coinzilla":
            if (coinzillaZone) {
              // Coinzilla embed
              const czScript = document.createElement("script")
              czScript.src = "https://coinzillatag.com/lib/display.js"
              czScript.async = true
              document.head.appendChild(czScript)

              czScript.onload = () => {
                const adDiv = document.createElement("div")
                adDiv.className = "coinzilla"
                adDiv.setAttribute("data-zone", coinzillaZone)
                containerRef.current?.appendChild(adDiv)
                // @ts-ignore
                window.coinzilla_display?.push({ zone: coinzillaZone })
              }
            }
            break

          case "bitsmedia":
            if (bitsmediaId && bitsmediaSlot) {
              // Bitsmedia/Bitmedia embed
              const bmScript = document.createElement("script")
              bmScript.src = `https://bitmedianetwork.com/js/${bitsmediaId}.js`
              bmScript.async = true
              bmScript.setAttribute("data-slot", bitsmediaSlot)
              containerRef.current?.appendChild(bmScript)
            }
            break
        }
        setIsLoaded(true)
      } catch (error) {
        console.error(`Failed to load ${provider} ad:`, error)
        setHasError(true)
      }
    }

    loadAd()

    return () => {
      // Cleanup
      if (containerRef.current) {
        containerRef.current.innerHTML = ""
      }
    }
  }, [provider, aadsId, coinzillaZone, bitsmediaId, bitsmediaSlot, dimensions])

  if (hasError) {
    return null // Don't show broken ads
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg bg-muted/30 transition-opacity",
        !isLoaded && "animate-pulse",
        className,
      )}
      style={{
        minWidth: dimensions.width,
        minHeight: dimensions.height,
        maxWidth: "100%",
      }}
      aria-label="Advertisement"
    />
  )
}
