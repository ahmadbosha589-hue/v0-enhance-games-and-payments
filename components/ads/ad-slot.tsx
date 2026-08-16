"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { AdBanner, type AdProvider, type AdSize } from "./ad-banner"
import { createBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"

interface AdConfig {
  provider: AdProvider
  enabled: boolean
  aads_id?: string
  coinzilla_zone?: string
  bitsmedia_id?: string
  bitsmedia_slot?: string
}

interface AdSlotProps {
  position: "sidebar" | "header" | "content" | "footer" | "between-content"
  size?: AdSize
  className?: string
  fallback?: React.ReactNode
}

const POSITION_SIZES: Record<string, AdSize> = {
  sidebar: "rectangle",
  header: "leaderboard",
  content: "rectangle",
  footer: "banner",
  "between-content": "banner",
}

export function AdSlot({ position, size, className, fallback }: AdSlotProps) {
  const [adConfig, setAdConfig] = useState<AdConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasMarketingConsent = useAdConsent()

  const effectiveSize = size || POSITION_SIZES[position] || "banner"

  useEffect(() => {
    // These are third-party (non-Google) advertising vendors (A-ADS,
    // CoinZilla, Bitsmedia) that set their own cookies/trackers. Only load
    // them once the visitor has granted Marketing consent via the Cookie
    // Preferences tool, per Google's EU User Consent Policy and general
    // GDPR/CCPA requirements for third-party ad vendors.
    if (!hasMarketingConsent) {
      setIsLoading(false)
      return
    }

    const fetchAdConfig = async () => {
      try {
        const supabase = createBrowserClient()
        const { data } = await supabase
          .from("ad_settings")
          .select("*")
          .eq("position", position)
          .eq("enabled", true)
          .single()

        if (data) {
          setAdConfig({
            provider: data.provider as AdProvider,
            enabled: data.enabled,
            aads_id: data.aads_id,
            coinzilla_zone: data.coinzilla_zone,
            bitsmedia_id: data.bitsmedia_id,
            bitsmedia_slot: data.bitsmedia_slot,
          })
        }
      } catch (error) {
        // No ad configured for this position - just finish loading
      } finally {
        setIsLoading(false)
      }
    }

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
    }, 3000)

    fetchAdConfig()

    return () => clearTimeout(timeoutId)
  }, [position, hasMarketingConsent])

  if (isLoading) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-lg bg-muted/20 animate-pulse", className)}
        style={{ minHeight: 60 }}
      />
    )
  }

  if (!hasMarketingConsent || !adConfig || !adConfig.enabled) {
    return fallback ? <>{fallback}</> : null
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {/* Ad disclosure label - this network's creative carries no
          built-in "Ad" marker of its own (unlike Google AdSense, which
          renders its own AdChoices icon), so we render one explicitly to
          keep the placement clearly distinguishable from page content. */}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Advertisement</span>
      <AdBanner
        provider={adConfig.provider}
        size={effectiveSize}
        aadsId={adConfig.aads_id}
        coinzillaZone={adConfig.coinzilla_zone}
        bitsmediaId={adConfig.bitsmedia_id}
        bitsmediaSlot={adConfig.bitsmedia_slot}
      />
    </div>
  )
}
