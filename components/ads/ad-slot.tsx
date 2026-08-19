"use client"

import type React from "react"

import { AdBanner, type AdProvider, type AdSize } from "./ad-banner"
import { cn } from "@/lib/utils"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { useAdConfig } from "@/lib/ads/use-ad-config"

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
  const hasMarketingConsent = useAdConsent()
  const { adSettings, isLoading: configLoading } = useAdConfig(hasMarketingConsent)
  const isLoading = hasMarketingConsent && configLoading
  const effectiveSize = size || POSITION_SIZES[position] || "banner"
  const settings = adSettings?.[position]
  const adConfig: AdConfig | null = settings?.provider
    ? {
        provider: settings.provider as AdProvider,
        enabled: Boolean(settings.enabled),
        aads_id: settings.aads_id,
        coinzilla_zone: settings.coinzilla_zone,
        bitsmedia_id: settings.bitsmedia_id,
        bitsmedia_slot: settings.bitsmedia_slot,
      }
    : null

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
