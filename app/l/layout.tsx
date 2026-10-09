import type React from "react"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { AAdsStickyUnit } from "@/components/ads/aads-sticky-unit"
import { AdsterraUnits } from "@/components/ads/adsterra-units"

/**
 * Shortlink view layout
 * ---------------------
 * Mounts the c.cx.ua floating banner (zone 32) on all shortlink pages.
 * The popup redirect script (zone 31) is intentionally disabled here:
 * its `t=1` mode redirects the CURRENT window, which would rip visitors
 * out of the countdown flow and break shortlink earnings.
 */
export default function ShortlinkLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <PublicAdsLayer disablePopup />
      {/* A-ADS adaptive banner unit 2457981 on every shortlink page. */}
      <div className="space-y-4 pb-4" aria-label="Sponsored placements">
      <AAdsAdaptiveUnit />
      <AdsterraUnits />
      </div>
      {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
      <AAdsStickyUnit />
      {/* Adsterra real placements (popunder on engaged surfaces only). */}
    </>
  )
}
