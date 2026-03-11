import type React from "react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/sidebar"
import { AdminHeader } from "@/components/admin/header"
import { ServerTime } from "@/components/server-time"
import type { Profile } from "@/lib/types/database"

export const dynamic = "force-dynamic"

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
  const supabase = await createClient()

  // If supabase is not configured, redirect to login
  if (!supabase) {
    redirect("/auth/login?redirect=/admin&error=db_not_configured")
  }

  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect("/auth/login?redirect=/admin")
  }

  const user = authData.user
  const email = user.email || ""

  // Get profile using admin client (bypasses RLS)
  let profile: Profile | null = null

  try {
    const adminSupabase = createAdminClient()
    const { data: profileData } = await adminSupabase.from("profiles").select("*").eq("id", user.id).single()

    if (profileData) {
      profile = profileData as Profile
    }
  } catch {
    // Continue with null profile
  }

  // Redirect regular users away from admin
  if (profile && profile.role === "user") {
    redirect("/dashboard")
  }

  // Use profile or default
  const safeProfile: Profile = profile || {
    ...defaultAdminProfile,
    id: user.id,
    username: email.split("@")[0] || "Admin",
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminSidebar profile={safeProfile} />
      <div className="lg:pl-72 flex flex-col flex-1">
        <AdminHeader profile={safeProfile} email={email} />
        <main className="flex-1 p-3 sm:p-4 md:p-6 pb-16">{children}</main>
        <ServerTime />
      </div>
    </div>
  )
}
