import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUser, getProfile } from "@/lib/supabase/server"
// NOTE: getUser() is awaited first because we need the userId for getProfile,
// but getProfile uses the admin client (no auth round-trip) so it returns
// in a single fast PostgREST call.
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AdSlot } from "@/components/ads/ad-slot"
import { FloatingWithdrawalTicker } from "@/components/shared/withdrawal-ticker-marquee"
import { AdblockProvider } from "@/components/adblock/adblock-provider"
import { PageAdsWrapper } from "@/components/ads/page-ads-wrapper"
import { ServerTime } from "@/components/server-time"
import { DeviceFingerprintProvider } from "@/components/security/device-fingerprint-provider"
import { AntiBotProvider } from "@/components/security/anti-bot-provider"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | CryptoFaucet Dashboard",
  },
  description: "Manage your earnings, claims, and withdrawals",
}

const defaultProfile = {
  id: "",
  username: null,
  display_name: "User",
  avatar_url: null,
  balance_satoshis: 0,
  total_earned_satoshis: 0,
  total_withdrawn_satoshis: 0,
  total_claims: 0,
  claim_streak: 0,
  last_claim_at: null,
  referral_code: "",
  referred_by: null,
  referral_count: 0,
  faucetpay_email: null,
  faucetpay_verified: false,
  role: "user" as const,
  status: "active" as const,
  is_flagged: false,
  fraud_score: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect("/auth/login?redirect=/dashboard")
  }

  const profile = await getProfile(user.id)

  const safeProfile = profile || { ...defaultProfile, id: user.id }

  return (
    <SidebarProvider>
      <DeviceFingerprintProvider>
        <AntiBotProvider>
          <AdblockProvider userId={user.id} warningDurationSeconds={60}>
            <DashboardSidebar profile={safeProfile} />
            <SidebarInset>
              <DashboardHeader profile={safeProfile} />
              <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 pb-24 sm:pb-20 scroll-smooth-container">
                <PageAdsWrapper
                  showHeaderAds={true}
                  showFooterAds={true}
                  showSidebarAds={false}
                  pageName="dashboard"
                >
                  {children}
                </PageAdsWrapper>
                <div className="hidden xl:block fixed right-4 top-1/2 -translate-y-1/2 z-10">
                  <AdSlot position="sidebar" size="skyscraper" />
                </div>
              </main>
              <ServerTime />
              <FloatingWithdrawalTicker />
              {/* c.cx.ua banner (zone 32) + popup redirect (zone 31).
                  Mounted on every dashboard page so logged-in users get
                  the partner banner and self-throttled popup, but NOT
                  shown in the admin panel (which never mounts this). */}
              <PublicAdsLayer />
            </SidebarInset>
          </AdblockProvider>
        </AntiBotProvider>
      </DeviceFingerprintProvider>
    </SidebarProvider>
  )
}
