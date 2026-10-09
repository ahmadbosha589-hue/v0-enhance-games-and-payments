"use client"

import { useEffect, useState } from "react"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"

/**
 * AAdsAdaptiveUnit
 * ----------------
 * Renders the A-ADS adaptive ad unit 2457981 (acceptable.a-ads.com iframe).
 *
 * - Mounted on every non-admin surface (public, dashboard, auth, shortlinks,
 *   404) so all pages carry the placement; the admin panel stays ad-free.
 * - Gated on marketing consent exactly like every other third-party ad slot
 *   on the site: no consent decision yet → nothing renders (the consent
 *   banner is already visible on those surfaces); declined → nothing.
 *   DNT/undecided visitors see no third-party ad request at all.
 * - The markup mirrors the official A-ADS snippet: protocol-relative iframe
 *   src, data-aa unit id, adaptive sizing. CSP frame-src allowlists
 *   https://acceptable.a-ads.com (see lib/security/csp-policy.mjs).
 */
export function AAdsAdaptiveUnit() {
  const hasMarketingConsent = useAdConsent()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !hasMarketingConsent) return null

  return (
    <div
      id="frame"
      className="w-full my-2"
      style={{ margin: "12px auto", position: "relative", zIndex: 99998 }}
      aria-label="Sponsored partner ad"
      role="complementary"
    >
      <iframe
        data-aa="2457981"
        src="//acceptable.a-ads.com/2457981/?size=Adaptive"
        style={{
          border: 0,
          padding: 0,
          width: "70%",
          height: "auto",
          overflow: "hidden",
          display: "block",
          margin: "auto",
        }}
        title="A-ADS sponsored ad"
        scrolling="no"
      />
    </div>
  )
}

export default AAdsAdaptiveUnit
