"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { CxUaBanner, CxUaPopupLoader } from "@/components/ads/cx-ua-ads"
import { cn } from "@/lib/utils"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"
import { useConsentDecision } from "@/lib/hooks/use-consent-decision"

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
 * The banner is dismissible per page view only: closing it hides it on the
 * current page, but it reappears as soon as the user navigates to another
 * page. Dismissal is intentionally NOT persisted (no sessionStorage) to
 * maximize impressions across the whole site.
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
  const pathname = usePathname()
  const hasMarketingConsent = useAdConsent()
  const { decided, marketing } = useConsentDecision()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  // Whether CxUaBanner has actually measured and is rendering a real
  // creative. The card chrome below (border, shadow, dismiss button) is
  // only shown once this is true — otherwise a blocked/empty ad response
  // (no active campaign, an ad blocker, Do-Not-Track) left the card's
  // border/padding/dismiss-button rendered around nothing: a collapsed
  // sliver with just the × floating in it and no ad or "Sponsored" label
  // anywhere near it.
  const [adVisible, setAdVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Re-show the banner on every page navigation. This layer is mounted in
  // persistent layouts, so component state survives client-side navigation —
  // resetting on pathname change guarantees a fresh impression per page.
  // adVisible resets too, so a stale "had a creative" flag from the
  // previous page can't render the chrome before the freshly (re)loading
  // banner on the new page has confirmed there's really something to show.
  useEffect(() => {
    setBannerDismissed(false)
    setAdVisible(false)
  }, [pathname])

  const handleDismiss = () => {
    setBannerDismissed(true)
  }

  // Decided AGAINST marketing ads: show a one-line explainer instead of
  // silently rendering nothing. Visitors (and the operator testing the site)
  // otherwise have no way to tell "ads are off for you" from "the banner is
  // broken" — which is exactly the confusion this component's history caused.
  // Undecided visitors get the consent banner instead; DNT stays silent.
  const dnt =
    typeof window !== "undefined" &&
    ((window as unknown as { doNotTrack?: string }).doNotTrack === "1" ||
      (navigator as unknown as { doNotTrack?: string }).doNotTrack === "1")

  if (!hasMarketingConsent) {
    if (!mounted || dnt) return null
    if (decided && marketing === false) {
      return (
        <div
          className="fixed bottom-0 inset-x-0 z-40 flex justify-center px-2 pb-2 sm:px-3 sm:pb-3 pointer-events-none"
          aria-label="Partner ads disabled"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur-sm px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
            <span>Partner ads are turned off in your cookie choices.</span>
            <a href="/cookies" className="font-medium text-primary hover:underline">
              Enable
            </a>
          </div>
        </div>
      )
    }
    return null
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
              "relative w-full max-w-[760px]",
              // The border/shadow/padding "card" look — and the dismiss
              // button below — only apply once CxUaBanner has confirmed a
              // creative is actually rendering. Until then (or if the slot
              // ends up empty) this div carries no chrome at all, so there's
              // nothing to collapse into a stray sliver. Sized to the
              // 728×90 creative + chrome: capped just above the creative's
              // natural width, with padding sized so the wrapper hugs the
              // ad rather than ballooning into a giant empty box. On
              // narrower screens CxUaBanner scales the creative down
              // proportionally.
              adVisible &&
                "pointer-events-auto rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-2 py-2"
            )}
          >
            {adVisible && (
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
            )}
            <CxUaBanner
              variant="default"
              showLabel
              className="w-full"
              onVisibilityChange={setAdVisible}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default PublicAdsLayer