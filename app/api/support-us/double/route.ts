import { getUser, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// $0.0003 per ad = approximately 3 satoshis
const REWARD_PER_AD = 3
const ADS_PER_SESSION = 3
const COOLDOWN_SECONDS = 60 // 1 minute cooldown for double rewards

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { adsWatched = 0, baseAmount = 0 } = body

    // Validate ads watched
    if (adsWatched < ADS_PER_SESSION) {
      return NextResponse.json(
        { error: `Please watch all ${ADS_PER_SESSION} ads to claim double reward` },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      // Return success even without database - for demo/preview mode
      const bonusAmount = baseAmount > 0 ? baseAmount : REWARD_PER_AD * ADS_PER_SESSION
      return NextResponse.json({
        success: true,
        bonusAmount,
        newBalance: bonusAmount,
        demo: true
      })
    }

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis, last_support_us_double_at, total_earned_satoshis")
      .eq("id", user.id)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Failed to fetch profile:", profileError)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    // Check cooldown
    if (profile?.last_support_us_double_at) {
      const lastDouble = new Date(profile.last_support_us_double_at)
      const now = new Date()
      const diffSeconds = (now.getTime() - lastDouble.getTime()) / 1000

      if (diffSeconds < COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(COOLDOWN_SECONDS - diffSeconds)
        return NextResponse.json(
          { error: `Please wait ${remainingSeconds} seconds before claiming again` },
          { status: 429 }
        )
      }
    }

    // Calculate bonus (same as base reward)
    const bonusAmount = baseAmount > 0 ? baseAmount : REWARD_PER_AD * ADS_PER_SESSION
    const currentBalance = profile?.balance_satoshis || 0
    const currentTotal = profile?.total_earned_satoshis || 0
    const newBalance = currentBalance + bonusAmount
    const newTotal = currentTotal + bonusAmount

    // Update balance
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: newTotal,
        last_support_us_double_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to update balance:", updateError)
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Log the bonus reward
    await adminSupabase.from("claims").insert({
      user_id: user.id,
      amount_satoshis: bonusAmount,
      claim_type: "support_us_double",
    }).catch(() => {
      // Claims table might not exist
    })

    // Update support stats
    const { data: existingStats } = await adminSupabase
      .from("support_stats")
      .select("total_support_earnings")
      .eq("user_id", user.id)
      .single()

    if (existingStats) {
      await adminSupabase.from("support_stats").update({
        total_support_earnings: (existingStats.total_support_earnings || 0) + bonusAmount,
        updated_at: new Date().toISOString()
      }).eq("user_id", user.id)
    }

    return NextResponse.json({
      success: true,
      bonusAmount,
      newBalance,
    })
  } catch (error) {
    console.error("Support-us double reward error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
