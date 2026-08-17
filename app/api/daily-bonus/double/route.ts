import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { baseAmount, multiplier = 2 } = body

    if (!baseAmount || typeof baseAmount !== "number" || baseAmount <= 0) {
      return NextResponse.json({ error: "Invalid base amount" }, { status: 400 })
    }

    // Validate multiplier
    if (multiplier < 2 || multiplier > 5) {
      return NextResponse.json({ error: "Invalid multiplier" }, { status: 400 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch {
      adminSupabase = supabase
    }

    // Get profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("id, balance_satoshis, total_earned_satoshis, status")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (profile.status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 })
    }

    // Calculate bonus (only the extra amount, not the full multiplied amount)
    const bonusAmount = Math.floor(baseAmount * (multiplier - 1))
    const currentBalance = Number(profile.balance_satoshis) || 0
    const currentTotalEarned = Number(profile.total_earned_satoshis) || 0
    const newBalance = currentBalance + bonusAmount

    // Get IP address
    const headersList = await headers()
    const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0] || 
      headersList.get("x-real-ip") || 
      "unknown"

    // Update profile with bonus
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: currentTotalEarned + bonusAmount,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to update profile:", updateError)
      return NextResponse.json({ error: "Failed to claim bonus" }, { status: 500 })
    }

    // Record transaction
    await adminSupabase.from("transactions").insert({
      user_id: user.id,
      type: "daily_bonus",
      status: "completed",
      amount_satoshis: bonusAmount,
      balance_before: currentBalance,
      balance_after: newBalance,
      description: `Daily bonus ${multiplier}x double reward`,
      metadata: {
        bonus_type: "daily_bonus_double",
        base_amount: baseAmount,
        multiplier,
        ip_address: ipAddress,
      },
      completed_at: new Date().toISOString(),
    })

    // Create notification
    await adminSupabase.from("notifications").insert({
      user_id: user.id,
      type: "claim_success",
      title: "Double Bonus Claimed!",
      message: `You received ${bonusAmount} extra satoshis (${multiplier}x bonus).`,
      data: { amount: bonusAmount, type: "daily_bonus_double", multiplier },
    })

    return NextResponse.json({
      success: true,
      bonusAmount,
      newBalance,
      multiplier,
    })
  } catch (error) {
    console.error("Daily bonus double claim error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
