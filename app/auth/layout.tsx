import type React from "react"
import type { Metadata } from "next"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { AAdsStickyUnit } from "@/components/ads/aads-sticky-unit"

// Login and account-recovery documents need request-scoped CSP nonces.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Authentication",
  description: "Sign in or create an account to start earning crypto",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      {/* c.cx.ua partner banner + popup redirect on every auth surface
          (login, sign-up, verify-email, etc.). Admin panel is excluded. */}
      <PublicAdsLayer disablePopup />
      {/* A-ADS adaptive banner unit 2457981 on every auth page. */}
      <AAdsAdaptiveUnit />
      {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
      <AAdsStickyUnit />
    </>
  )
}
