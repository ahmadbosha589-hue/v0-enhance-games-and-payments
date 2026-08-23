import type React from "react"
import type { Metadata } from "next"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"

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
    </>
  )
}
