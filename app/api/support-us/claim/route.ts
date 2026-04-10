import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// $0.0007 per ad = approximately 7 satoshis at current rates
const REWARD_PER_AD = 7
const ADS_PER_SESSION = 3
const COOLDOWN_MINUTES = 60 // 1 hour cooldown

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { adsWatched = 0 } = body

    if (adsWatched < ADS_PER_SESSION) {
      return NextResponse.json(
        { error: `Please watch all ${ADS_PER_SESSION} ads to claim reward` },
        { status: 400 }
      )
    }

    // Check cooldown
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance_satoshis, last_support_us_claim_at")
      .eq("id", user.id)
      .single()

    if (profile?.last_support_us_claim_at) {
      const lastClaim = new Date(profile.last_support_us_claim_at)
      const now = new Date()
      const diffMinutes = (now.getTime() - lastClaim.getTime()) / (1000 * 60)
      
      if (diffMinutes < COOLDOWN_MINUTES) {
        const remainingMinutes = Math.ceil(COOLDOWN_MINUTES - diffMinutes)
        return NextResponse.json(
          { error: `Please wait ${remainingMinutes} minutes before claiming again` },
          { status: 429 }
        )
      }
    }

    const totalReward = REWARD_PER_AD * ADS_PER_SESSION
    const newBalance = (profile?.balance_satoshis || 0) + totalReward

    // Update balance and last claim time
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        last_support_us_claim_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Log the reward
    await supabase.from("claims").insert({
      user_id: user.id,
      amount_satoshis: totalReward,
      claim_type: "support_us",
    })

    return NextResponse.json({
      success: true,
      reward: totalReward,
      newBalance,
      rewardUSD: (ADS_PER_SESSION * 0.0007).toFixed(4),
    })
  } catch (error) {
    console.error("Support-us claim error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
