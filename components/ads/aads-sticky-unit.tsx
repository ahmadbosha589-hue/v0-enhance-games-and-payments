"use client"

import { useEffect, useState } from "react"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"

/**
 * AAdsStickyUnit
 * --------------
 * The official A-ADS dismissable sticky/anchor unit 2457981, rendered at the
 * top of the viewport. The visitor can close it with the × control; like the
 * c.cx.ua banner in PublicAdsLayer, dismissal is per page view only (it
 * returns on the next navigation) to maximize impressions.
 *
 * Markup mirrors A-ADS' published snippet: fixed full-width container with
 * the adaptive iframe centered at 70% width, a semi-transparent × label,
 * and a hidden checkbox-less React port of the CSS-only dismissal. Gated on
 * marketing consent like every third-party ad on the site.
 */
export function AAdsStickyUnit() {
  const hasMarketingConsent = useAdConsent()
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !hasMarketingConsent || dismissed) return null

  return (
    <div style={{ position: "relative", zIndex: 99999 }} aria-label="Sponsored banner" role="complementary">
      <div style={{ paddingTop: "auto", paddingBottom: 0 }}>
        <div
          style={{
            width: "100%",
            height: "auto",
            position: "fixed",
            textAlign: "center",
            fontSize: 0,
            top: 0,
            left: 0,
            right: 0,
            margin: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss sponsored banner"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              right: "24px",
              position: "absolute",
              borderRadius: "4px",
              background: "rgba(248, 248, 249, 0.70)",
              padding: "4px",
              zIndex: 99999,
              cursor: "pointer",
              border: "none",
              lineHeight: 0,
            }}
          >
            <svg fill="#000000" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490" aria-hidden="true">
              <polygon points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 " />
            </svg>
          </button>
          <div id="aadssticky" style={{ width: "100%", margin: "auto", position: "relative", zIndex: 99998 }}>
            <iframe
              data-aa="2457981"
              src="//acceptable.a-ads.com/2457981/?size=Adaptive"
              style={{ border: 0, padding: 0, width: "70%", height: "auto", overflow: "hidden", margin: "auto", display: "block" }}
              title="A-ADS sponsored ad"
              scrolling="no"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AAdsStickyUnit
