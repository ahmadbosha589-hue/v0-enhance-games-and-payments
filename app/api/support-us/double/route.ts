import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// $0.0007 per ad = approximately 7 satoshis
const REWARD_PER_AD = 7
const ADS_PER_SESSION = 3

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { adsWatched = 0, baseAmount = 0 } = body

    if (adsWatched < 3) {
      return NextResponse.json(
        { error: "Please watch all 3 ads to claim double reward" },
        { status: 400 }
      )
    }

    // Check if user already claimed double reward for this session
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance_satoshis, last_support_us_double_at")
      .eq("id", user.id)
      .single()

    if (profile?.last_support_us_double_at) {
      const lastDouble = new Date(profile.last_support_us_double_at)
      const now = new Date()
      const diffMinutes = (now.getTime() - lastDouble.getTime()) / (1000 * 60)
      
      // 5 minute cooldown between double rewards
      if (diffMinutes < 5) {
        return NextResponse.json(
          { error: "Double reward already claimed for this session" },
          { status: 429 }
        )
      }
    }

    // Calculate bonus (same as base reward)
    const bonusAmount = baseAmount > 0 ? baseAmount : REWARD_PER_AD * ADS_PER_SESSION
    const newBalance = (profile?.balance_satoshis || 0) + bonusAmount

    // Update balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        last_support_us_double_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Log the bonus reward
    await supabase.from("claims").insert({
      user_id: user.id,
      amount_satoshis: bonusAmount,
      claim_type: "support_us_double",
    })

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
