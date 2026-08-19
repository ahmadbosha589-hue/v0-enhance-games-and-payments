"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { readConsent } from "@/lib/consent/store"
import { assertAdsenseAllowed } from "@/lib/ads/zones"
import { cn } from "@/lib/utils"

interface AdsenseBannerProps {
  slot: string
  format?: "auto" | "fluid" | "rectangle"
  className?: string
}

type AdsenseWindow = Window & {
  adsbygoogle?: Array<Record<string, unknown>>
}

/**
 * The only AdSense component. It is deliberately not mounted by default until
 * publisher approval, slot configuration, and consent are all present.
 */
export function AdsenseBanner({ slot, format = "auto", className }: AdsenseBannerProps) {
  const pathname = usePathname() || ""
  const marketing = useAdConsent()
  const [decided, setDecided] = useState(false)
  const adRef = useRef<HTMLElement | null>(null)
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID

  useEffect(() => {
    const sync = () => setDecided(readConsent().decidedAt !== null)
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener("cookie-preferences-updated", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("cookie-preferences-updated", sync)
    }
  }, [])

  useEffect(() => {
    if (!publisherId || !assertAdsenseAllowed(pathname) || !decided || !marketing || !adRef.current) return
    const element = adRef.current
    const scriptId = "adsense-loader"
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const pushAd = () => {
      try {
        ;((window as AdsenseWindow).adsbygoogle ||= []).push({})
      } catch {
        // The slot remains empty rather than rendering a fake creative.
      }
    }

    if (!script) {
      script = document.createElement("script")
      script.id = scriptId
      script.async = true
      script.crossOrigin = "anonymous"
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`
      script.onload = pushAd
      document.head.appendChild(script)
    } else {
      pushAd()
    }
  }, [publisherId, pathname, decided, marketing])

  if (!publisherId || !assertAdsenseAllowed(pathname) || !decided || !marketing) return null

  return (
    <div className={cn("min-h-[90px]", className)}>
      <span className="sr-only">Advertisement</span>
      <ins
        ref={(node) => { adRef.current = node }}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={publisherId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  )
}
