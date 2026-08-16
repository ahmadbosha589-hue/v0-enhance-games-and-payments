import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Get detailed referral statistics for the authenticated user
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_count, referral_earnings_satoshis, referral_code")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get referrals with their earnings
    const { data: referrals } = await supabase
      .from("profiles")
      .select("id, display_name, created_at, total_earned_satoshis, status, last_claim_at")
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false })

    // Get recent referral transactions
    const { data: recentTransactions } = await supabase
      .from("transactions")
      .select("id, amount_satoshis, created_at, description, referral_id")
      .eq("user_id", user.id)
      .eq("type", "referral_bonus")
      .order("created_at", { ascending: false })
      .limit(20)

    // Calculate statistics
    const activeReferrals =
      referrals?.filter((r) => {
        if (!r.last_claim_at) return false
        const lastClaim = new Date(r.last_claim_at)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        return lastClaim > weekAgo
      }).length || 0

    const totalReferralEarnings = referrals?.reduce((sum, r) => sum + (r.total_earned_satoshis || 0), 0) || 0

    // Earnings by tier (from transactions)
    const earningsByTier = {
      tier1: 0,
      tier2: 0,
      tier3: 0,
    }

    recentTransactions?.forEach((t) => {
      if (t.description?.includes("Tier 1")) earningsByTier.tier1 += t.amount_satoshis
      else if (t.description?.includes("Tier 2")) earningsByTier.tier2 += t.amount_satoshis
      else if (t.description?.includes("Tier 3")) earningsByTier.tier3 += t.amount_satoshis
    })

    return NextResponse.json({
      referralCode: profile.referral_code,
      totalReferrals: profile.referral_count,
      activeReferrals,
      totalEarnings: profile.referral_earnings_satoshis,
      totalReferralEarnings,
      earningsByTier,
      referrals: referrals || [],
      recentTransactions: recentTransactions || [],
    })
  } catch (error) {
    console.error("Referral stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
