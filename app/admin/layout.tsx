import type React from "react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/sidebar"
import { AdminHeader } from "@/components/admin/header"
import { ServerTime } from "@/components/server-time"
import { SupabaseHealthProvider } from "@/components/admin/supabase-health-provider"
import { ConnectivityBanner } from "@/components/admin/connectivity-banner"
import type { Profile } from "@/lib/types/database"
import { unstable_noStore as noStore } from "next/cache"

export const dynamic = "force-dynamic"
export const maxDuration = 10 // Set max duration for server-side rendering

const defaultAdminProfile: Profile = {
  id: "",
  username: "Admin",
  display_name: "Admin User",
  avatar_url: null,
  role: "admin",
  status: "active",
  balance_satoshis: 0,
  total_earned_satoshis: 0,
  total_withdrawn_satoshis: 0,
  referral_code: "",
  referred_by: null,
  referral_count: 0,
  referral_earnings_satoshis: 0,
  last_claim_at: null,
  total_claims: 0,
  claim_streak: 0,
  max_claim_streak: 0,
  two_factor_enabled: false,
  fraud_score: 0,
  is_flagged: false,
  faucetpay_email: null,
  faucetpay_verified: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_active_at: new Date().toISOString(),
  banned_at: null,
  banned_reason: null,
  last_daily_bonus_at: null,
  total_daily_bonuses: 0,
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Prevent caching to ensure fresh auth state
  noStore()

  let user: { id: string; email?: string } | null = null
  let profile: Profile | null = null

  try {
    const supabase = await Promise.race([
      createClient(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    ])

    if (supabase) {
      // Use Promise.race with a timeout to prevent hanging
      const authPromise = supabase.auth.getUser()
      const timeoutPromise = new Promise<{ data: { user: null }; error: null }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null }, error: null }), 5000)
      )

      const { data: authData, error: authError } = await Promise.race([authPromise, timeoutPromise])

      if (!authError && authData?.user) {
        user = authData.user

        // Get profile using admin client (bypasses RLS) with timeout
        try {
          const adminSupabase = createAdminClient()
          if (adminSupabase) {
            const profilePromise = adminSupabase.from("profiles").select("*").eq("id", user.id).single()
            const profileTimeout = new Promise<{ data: null }>((resolve) =>
              setTimeout(() => resolve({ data: null }), 3000)
            )
            const { data: profileData } = await Promise.race([profilePromise, profileTimeout])
            if (profileData) {
              profile = profileData as Profile
            }
          }
        } catch {
          // Continue with null profile
        }

        // Redirect regular users away from admin
        if (profile && profile.role === "user") {
          redirect("/dashboard")
        }
      }
    }
  } catch {
    // Supabase not available - continue with defaults to allow page to render
  }

  const email = user?.email || ""

  // Use profile or default
  const safeProfile: Profile = profile || {
    ...defaultAdminProfile,
    id: user?.id || "",
    username: email ? email.split("@")[0] : "Admin",
  }

  return (
    <SupabaseHealthProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <AdminSidebar profile={safeProfile} />
        <div className="lg:pl-72 flex flex-col flex-1">
          <AdminHeader profile={safeProfile} email={email} />
          <ConnectivityBanner />
          <main className="flex-1 p-3 sm:p-4 md:p-6 pb-16">{children}</main>
          <ServerTime />
        </div>
      </div>
    </SupabaseHealthProvider>
  )
}
