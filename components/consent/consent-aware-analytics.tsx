"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { readConsent } from "@/lib/consent/store"

export function ConsentAwareAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const sync = () => setEnabled(readConsent().analytics === true)
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener("cookie-preferences-updated", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("cookie-preferences-updated", sync)
    }
  }, [])

  if (!enabled) return null
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
