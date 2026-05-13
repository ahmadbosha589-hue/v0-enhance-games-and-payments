"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { CxUaBanner, CxUaPopupLoader } from "@/components/ads/cx-ua-ads"
import { cn } from "@/lib/utils"

/**
 * PublicAdsLayer
 * --------------
 * Mounts the c.cx.ua popup redirect loader (zone 31) and a dismissible
 * floating c.cx.ua banner (zone 32) on every public-facing surface of the
 * app (marketing pages, auth pages, landing, etc.).
 *
 * The admin panel intentionally does NOT mount this layer so admins are never
 * shown the popup redirect or banner while moderating.
 *
 * The popup script self-throttles via `f=1&t=24` (one redirect per visitor
 * per 24 hours), so users never see more than one popup per day.
 *
 * The banner is dismissible per-session and remembered in sessionStorage.
 */
export function PublicAdsLayer() {
  const [bannerDismissed, setBannerDismissed] = useState(true) // start hidden to avoid hydration mismatch
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const dismissed = sessionStorage.getItem("cxua_banner_dismissed_v1") === "1"
      setBannerDismissed(dismissed)
    } catch {
      setBannerDismissed(false)
    }
  }, [])

  const handleDismiss = () => {
    setBannerDismissed(true)
    try {
      sessionStorage.setItem("cxua_banner_dismissed_v1", "1")
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Popup redirect script (zone 31) — fires at most once per 24h per visitor */}
      <CxUaPopupLoader />

      {/* Floating banner (zone 32) — pinned to the bottom on every public page.
          Hidden until the client has mounted to keep SSR output stable, and
          dismissible so it never blocks important UI. */}
      {mounted && !bannerDismissed && (
        <div
          className={cn(
            "fixed bottom-2 left-1/2 -translate-x-1/2 z-40",
            "w-[calc(100%-1rem)] max-w-[760px]",
            "rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg",
            "p-2 sm:p-3"
          )}
          role="complementary"
          aria-label="Sponsored partner banner"
        >
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss sponsored banner"
            className={cn(
              "absolute -top-2 -right-2 z-10",
              "h-7 w-7 rounded-full border bg-background text-muted-foreground",
              "flex items-center justify-center shadow-sm",
              "hover:text-foreground hover:bg-muted transition-colors"
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <CxUaBanner variant="compact" showLabel={true} className="w-full" />
        </div>
      )}
    </>
  )
}

export default PublicAdsLayer
