import { getUser, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// $0.0003 per ad = approximately 3 satoshis at current rates
const REWARD_PER_AD = 3
const ADS_PER_SESSION = 3
const COOLDOWN_SECONDS = 120 // 2 minute cooldown between sessions

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { adsWatched = 0, totalEarnings: requestedEarnings } = body

    // Validate that all ads were watched
    if (adsWatched < ADS_PER_SESSION) {
      return NextResponse.json(
        { error: `Please watch all ${ADS_PER_SESSION} ads to claim reward` },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      // Return success even without database - for demo/preview mode
      const totalReward = requestedEarnings || (REWARD_PER_AD * ADS_PER_SESSION)
      return NextResponse.json({
        success: true,
        reward: totalReward,
        newBalance: totalReward,
        rewardUSD: (ADS_PER_SESSION * 0.0003).toFixed(4),
        demo: true
      })
    }

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis, last_support_us_claim_at, total_earned_satoshis")
      .eq("id", user.id)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Failed to fetch profile:", profileError)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    // Check cooldown
    if (profile?.last_support_us_claim_at) {
      const lastClaim = new Date(profile.last_support_us_claim_at)
      const now = new Date()
      const diffSeconds = (now.getTime() - lastClaim.getTime()) / 1000

      if (diffSeconds < COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(COOLDOWN_SECONDS - diffSeconds)
        return NextResponse.json(
          { error: `Please wait ${remainingSeconds} seconds before claiming again` },
          { status: 429 }
        )
      }
    }

    const totalReward = requestedEarnings || (REWARD_PER_AD * ADS_PER_SESSION)
    const currentBalance = profile?.balance_satoshis || 0
    const currentTotal = profile?.total_earned_satoshis || 0
    const newBalance = currentBalance + totalReward
    const newTotal = currentTotal + totalReward

    // Update user balance
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: newTotal,
        last_support_us_claim_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to update balance:", updateError)
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Log the reward in claims table
    await adminSupabase.from("claims").insert({
      user_id: user.id,
      amount_satoshis: totalReward,
      claim_type: "support_us",
    }).catch(() => {
      // Claims table might not exist
    })

    // Update support stats for tracking
    const { data: existingStats } = await adminSupabase
      .from("support_stats")
      .select("ads_watched_today, total_ads_watched, total_support_earnings")
      .eq("user_id", user.id)
      .single()

    if (existingStats) {
      await adminSupabase.from("support_stats").update({
        ads_watched_today: (existingStats.ads_watched_today || 0) + adsWatched,
        total_ads_watched: (existingStats.total_ads_watched || 0) + adsWatched,
        total_support_earnings: (existingStats.total_support_earnings || 0) + totalReward,
        updated_at: new Date().toISOString()
      }).eq("user_id", user.id)
    } else {
      await adminSupabase.from("support_stats").insert({
        user_id: user.id,
        ads_watched_today: adsWatched,
        total_ads_watched: adsWatched,
        total_support_earnings: totalReward,
        updated_at: new Date().toISOString()
      }).catch(() => {
        // Table might not exist yet
      })
    }

    return NextResponse.json({
      success: true,
      reward: totalReward,
      newBalance,
      rewardUSD: (ADS_PER_SESSION * 0.0003).toFixed(4),
    })
  } catch (error) {
    console.error("Support-us claim error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
