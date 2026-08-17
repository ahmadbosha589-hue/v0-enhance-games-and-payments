import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const DAILY_BONUS_CONFIG = {
  minAmount: 2, // Reduced from 3 - stricter limits
  maxAmount: 5, // Reduced from 6 - max 5 sats per daily bonus
  cooldownHours: 24,
}

function calculateDailyBonusAmount(): number {
  return (
    Math.floor(Math.random() * (DAILY_BONUS_CONFIG.maxAmount - DAILY_BONUS_CONFIG.minAmount + 1)) +
    DAILY_BONUS_CONFIG.minAmount
  )
}

function canClaimDailyBonus(lastBonusAt: string | null): { canClaim: boolean; secondsRemaining: number } {
  if (!lastBonusAt) {
    return { canClaim: true, secondsRemaining: 0 }
  }

  const lastBonus = new Date(lastBonusAt).getTime()
  const now = Date.now()
  const cooldownMs = DAILY_BONUS_CONFIG.cooldownHours * 60 * 60 * 1000
  const timeElapsed = now - lastBonus

  if (timeElapsed >= cooldownMs) {
    return { canClaim: true, secondsRemaining: 0 }
  }

  return {
    canClaim: false,
    secondsRemaining: Math.ceil((cooldownMs - timeElapsed) / 1000),
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (e) {
      // Fallback to regular client if admin client fails
      adminSupabase = supabase
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("id, last_daily_bonus_at, total_daily_bonuses")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("Profile query error:", profileError)
      return NextResponse.json({
        canClaim: true,
        secondsRemaining: 0,
        totalBonuses: 0,
        minAmount: DAILY_BONUS_CONFIG.minAmount,
        maxAmount: DAILY_BONUS_CONFIG.maxAmount,
      })
    }

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const lastBonusAt = profile.last_daily_bonus_at || null
    const totalBonuses = profile.total_daily_bonuses || 0

    const { canClaim, secondsRemaining } = canClaimDailyBonus(lastBonusAt)

    return NextResponse.json({
      canClaim,
      secondsRemaining,
      totalBonuses,
      minAmount: DAILY_BONUS_CONFIG.minAmount,
      maxAmount: DAILY_BONUS_CONFIG.maxAmount,
    })
  } catch (error) {
    console.error("Daily bonus check error:", error)
    return NextResponse.json({
      canClaim: true,
      secondsRemaining: 0,
      totalBonuses: 0,
      minAmount: DAILY_BONUS_CONFIG.minAmount,
      maxAmount: DAILY_BONUS_CONFIG.maxAmount,
    })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (e) {
      adminSupabase = supabase
    }

    // Get profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select(
        "id, balance_satoshis, total_earned_satoshis, last_daily_bonus_at, total_daily_bonuses, status, is_flagged, fraud_score",
      )
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      console.error("Profile fetch error:", profileError)
      return NextResponse.json({ error: "Profile not found. Please try again." }, { status: 404 })
    }

    // Check account status
    if (profile.status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 })
    }

    if (profile.is_flagged && profile.fraud_score >= 70) {
      return NextResponse.json({ error: "Account under review" }, { status: 403 })
    }

    const lastBonusAt = profile.last_daily_bonus_at || null
    const currentTotalBonuses = profile.total_daily_bonuses || 0

    // Check cooldown
    const { canClaim, secondsRemaining } = canClaimDailyBonus(lastBonusAt)

    if (!canClaim) {
      return NextResponse.json(
        {
          error: "Daily bonus already claimed",
          secondsRemaining,
        },
        { status: 429 },
      )
    }

    // Calculate bonus amount
    const bonusAmount = calculateDailyBonusAmount()
    const currentBalance = Number(profile.balance_satoshis) || 0
    const currentTotalEarned = Number(profile.total_earned_satoshis) || 0
    const newBalance = currentBalance + bonusAmount

    // Get IP address
    const headersList = await headers()
    const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0] || headersList.get("x-real-ip") || "unknown"

    // Update profile with bonus
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        last_daily_bonus_at: new Date().toISOString(),
        total_daily_bonuses: currentTotalBonuses + 1,
        total_earned_satoshis: currentTotalEarned + bonusAmount,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to update profile:", updateError)
      return NextResponse.json({ error: "Failed to claim bonus. Please try again." }, { status: 500 })
    }

    const { error: txError } = await adminSupabase.from("transactions").insert({
      user_id: user.id,
      type: "daily_bonus",
      status: "completed",
      amount_satoshis: bonusAmount,
      balance_before: currentBalance,
      balance_after: newBalance,
      description: "Daily bonus claim",
      metadata: {
        bonus_type: "daily",
        ip_address: ipAddress,
      },
      completed_at: new Date().toISOString(),
    })

    if (txError) {
      console.error("Transaction insert error:", txError)
      // Don't fail the whole request if transaction logging fails
    }

    // Create notification
    const { error: notifError } = await adminSupabase.from("notifications").insert({
      user_id: user.id,
      type: "claim_success",
      title: "Daily Bonus Claimed!",
      message: `You received ${bonusAmount} satoshis as your daily bonus.`,
      data: { amount: bonusAmount, type: "daily_bonus" },
    })

    if (notifError) {
      console.error("Notification insert error:", notifError)
      // Don't fail the whole request if notification fails
    }

    return NextResponse.json({
      success: true,
      amount: bonusAmount,
      newBalance,
      totalBonuses: currentTotalBonuses + 1,
    })
  } catch (error) {
    console.error("Daily bonus claim error:", error)
    return NextResponse.json({ error: "Internal server error. Please try again." }, { status: 500 })
  }
}
