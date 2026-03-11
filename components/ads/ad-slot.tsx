"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { AdBanner, type AdProvider, type AdSize } from "./ad-banner"
import { createBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

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

  const effectiveSize = size || POSITION_SIZES[position] || "banner"

  useEffect(() => {
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
        // No ad configured for this position
      } finally {
        setIsLoading(false)
      }
    }

    fetchAdConfig()
  }, [position])

  if (isLoading) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-lg bg-muted/20 animate-pulse", className)}
        style={{ minHeight: 60 }}
      />
    )
  }

  if (!adConfig || !adConfig.enabled) {
    return fallback ? <>{fallback}</> : null
  }

  return (
    <div className={cn("flex justify-center", className)}>
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
