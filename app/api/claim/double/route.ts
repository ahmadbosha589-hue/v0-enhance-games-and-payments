import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"

// Rate limit: Only allow double reward once per claim
const DOUBLE_REWARD_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"

    const body = await req.json()
    const { baseAmount, multiplier = 2, adsWatched = 0, fingerprint } = body

    if (!baseAmount || typeof baseAmount !== "number" || baseAmount <= 0) {
      return NextResponse.json({ error: "Invalid base amount" }, { status: 400 })
    }

    if (adsWatched < 3) {
      return NextResponse.json({ error: "Must watch all ads first" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Get user's profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("id, balance_satoshis, last_double_reward_at")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check cooldown for double reward
    if (profile.last_double_reward_at) {
      const lastDoubleReward = new Date(profile.last_double_reward_at).getTime()
      const now = Date.now()
      if (now - lastDoubleReward < DOUBLE_REWARD_COOLDOWN_MS) {
        const remaining = Math.ceil((DOUBLE_REWARD_COOLDOWN_MS - (now - lastDoubleReward)) / 1000)
        return NextResponse.json({
          error: `Please wait ${remaining} seconds before claiming another double reward`,
        }, { status: 429 })
      }
    }

    // Validate base amount is reasonable (anti-cheat)
    const maxAllowedBase = 500 // Max base amount for double reward
    if (baseAmount > maxAllowedBase) {
      return NextResponse.json({ error: "Invalid reward amount" }, { status: 400 })
    }

    // Calculate bonus amount
    const bonusAmount = Math.floor(baseAmount * (multiplier - 1))

    // Update balance and record the double reward
    const newBalance = Number(profile.balance_satoshis) + bonusAmount

    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        last_double_reward_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("[claim/double] Update error:", updateError)
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Record the transaction
    await adminSupabase.from("transactions").insert({
      user_id: user.id,
      type: "double_reward",
      amount: bonusAmount,
      description: `Double reward bonus (watched ${adsWatched} ads)`,
      balance_after: newBalance,
      metadata: {
        base_amount: baseAmount,
        multiplier,
        ads_watched: adsWatched,
        ip_address: ip,
        fingerprint,
      },
    })

    return NextResponse.json({
      success: true,
      bonusAmount,
      newBalance,
      message: `Double reward claimed! +${bonusAmount} satoshis`,
    })
  } catch (error) {
    console.error("[claim/double] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
