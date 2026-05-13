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
 * Important: the popup zone is configured in the c.cx.ua publisher panel
 * with `?f=4&t=1`. The `t=1` mode redirects the CURRENT page to the ad
 * offer (not a popunder in a new tab). That is appropriate on engaged
 * in-app pages but catastrophic on first-touch marketing surfaces (the
 * landing page would appear to "refresh" itself and bounce every visitor
 * straight back out). Callers that render this on the public landing
 * page MUST pass `disablePopup` to suppress the redirect script there.
 *
 * The banner is dismissible per-session and remembered in sessionStorage.
 */
export interface PublicAdsLayerProps {
  /**
   * Suppress the c.cx.ua popup/clickunder/redirect script. Pass `true`
   * on the marketing landing page and any other first-touch surface to
   * avoid redirecting visitors away from the site.
   */
  disablePopup?: boolean
}

export function PublicAdsLayer({ disablePopup = false }: PublicAdsLayerProps = {}) {
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
      {/* Popup redirect script (zone 31). The c.cx.ua zone is configured
          in `t=1` (current-window redirect) mode, so we only mount it on
          surfaces that can tolerate the user being redirected away —
          never on the landing page (see prop docs above). */}
      {!disablePopup && <CxUaPopupLoader />}

      {/* Sticky bottom leaderboard (zone 32 — 728×90, the size configured
          in the c.cx.ua publisher panel). The banner component scales
          itself DOWN proportionally on narrower viewports so the same
          creative renders correctly on mobile too. Hidden until client
          mounts so SSR output stays stable, and dismissible per session. */}
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
              "pointer-events-auto relative",
              // Sized to the 728×90 creative + chrome: capped just above
              // the creative's natural width, with padding sized so the
              // wrapper hugs the ad rather than ballooning into a giant
              // empty box. On narrower screens CxUaBanner scales the
              // creative down proportionally.
              "w-full max-w-[760px]",
              "rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg",
              "px-2 py-2"
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
            <CxUaBanner variant="default" showLabel className="w-full" />
          </div>
        </div>
      )}
    </>
  )
}

export default PublicAdsLayer
