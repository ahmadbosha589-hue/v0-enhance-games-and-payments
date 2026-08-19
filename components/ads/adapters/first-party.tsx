"use client"

import { useEffect, useState } from "react"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { channelForPlacement, type FirstPartyPlacement } from "@/lib/ads/first-party"
import { cn } from "@/lib/utils"

interface ServedCreative {
  title?: string
  description?: string
  creativeUrl: string
  clickUrl: string
  impressionId?: number | null
}

interface FirstPartyAdSlotProps {
  placement: FirstPartyPlacement
  className?: string
  width?: number
  height?: number
}

export function FirstPartyAdSlot({
  placement,
  className,
  width = 300,
  height = 250,
}: FirstPartyAdSlotProps) {
  const hasMarketingConsent = useAdConsent()
  const [creative, setCreative] = useState<ServedCreative | null>(null)

  useEffect(() => {
    if (!hasMarketingConsent) {
      setCreative(null)
      return
    }

    const controller = new AbortController()
    fetch("/api/ads/serve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        slot: placement,
        channel: channelForPlacement(placement),
      }),
    })
      .then(async (response) => {
        if (response.status === 204 || !response.ok) return null
        return response.json() as Promise<ServedCreative>
      })
      .then((nextCreative) => {
        if (!controller.signal.aborted) setCreative(nextCreative)
      })
      .catch(() => {
        if (!controller.signal.aborted) setCreative(null)
      })

    return () => controller.abort()
  }, [hasMarketingConsent, placement])

  if (!creative || !hasMarketingConsent) return null

  return (
    <div className={cn("flex w-full flex-col items-center gap-1", className)}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Advertisement</span>
      <a
        href={creative.clickUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        aria-label={creative.title || "Sponsored advertisement"}
        className="block overflow-hidden rounded-md border border-border/40 bg-muted/10"
        style={{ width: "100%", maxWidth: width, aspectRatio: `${width} / ${height}` }}
      >
        <img
          src={creative.creativeUrl}
          alt={creative.title || "Sponsored advertisement"}
          width={width}
          height={height}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </a>
    </div>
  )
}
