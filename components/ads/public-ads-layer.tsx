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

      {/* Sticky bottom strip (zone 32). Slim leaderboard so it never blocks
          content: 50px tall on mobile, 60px on small screens, 90px on
          desktop — matching industry-standard sticky banner sizes
          (320x50 mobile, 728x90 desktop). Hidden until client mounts so
          SSR output stays stable, and dismissible per session. */}
      {mounted && !bannerDismissed && (
        <div
          className={cn(
            "fixed bottom-0 inset-x-0 z-40",
            "flex justify-center",
            "px-2 pb-2 pt-1 sm:px-3 sm:pb-3",
            "pointer-events-none" // wrapper passes clicks; child re-enables
          )}
          role="complementary"
          aria-label="Sponsored partner banner"
        >
          <div
            className={cn(
              "pointer-events-auto relative w-full",
              "max-w-[360px] sm:max-w-[480px] md:max-w-[760px]",
              "rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg",
              "p-1.5 sm:p-2"
            )}
          >
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss sponsored banner"
              className={cn(
                "absolute -top-2 -right-2 z-10",
                "h-6 w-6 rounded-full border bg-background text-muted-foreground",
                "flex items-center justify-center shadow-sm",
                "hover:text-foreground hover:bg-muted transition-colors"
              )}
            >
              <X className="h-3 w-3" />
            </button>
            <CxUaBanner variant="slim" showLabel={false} className="w-full" />
          </div>
        </div>
      )}
    </>
  )
}

export default PublicAdsLayer
