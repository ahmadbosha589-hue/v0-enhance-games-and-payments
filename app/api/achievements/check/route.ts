import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = requireAdminClient()

    // Fetch all active achievements
    const { data: achievements } = await adminSupabase
      .from("achievements")
      .select("*")
      .eq("is_active", true)

    if (!achievements || achievements.length === 0) {
      return NextResponse.json({ newlyUnlocked: [] })
    }

    // Fetch current profile stats
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("total_claims, claim_streak, max_claim_streak, total_earned_satoshis, referral_count")
      .eq("id", user.id)
      .single()

    if (!profile) return NextResponse.json({ newlyUnlocked: [] })

    // Fetch existing user_achievements (already completed)
    const { data: userAchs } = await adminSupabase
      .from("user_achievements")
      .select("achievement_id, completed, reward_claimed")
      .eq("user_id", user.id)

    const completedIds = new Set(
      (userAchs ?? []).filter(ua => ua.completed).map(ua => ua.achievement_id)
    )

    // Hoist counts the engine needs beyond the profile row — avoids N+1
    // queries when multiple achievements share a type.
    let gamesWonCount: number | null = null
    let ptcViewsCount: number | null = null
    let offersCompletedCount: number | null = null
    let withdrawalCount: number | null = null
    const hasGamesWonAch = achievements.some(a => a.requirement_type === "games_won")
    if (hasGamesWonAch) {
      const { count } = await adminSupabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "completed")
      gamesWonCount = count ?? 0
    }
    const hasPtcViewsAch = achievements.some(a => a.requirement_type === "ptc_views")
    if (hasPtcViewsAch) {
      const { count } = await adminSupabase
        .from("ptc_views")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("completed", true)
      ptcViewsCount = count ?? 0
    }
    const hasOffersAch = achievements.some(a => a.requirement_type === "offers_completed")
    if (hasOffersAch) {
      const { count } = await adminSupabase
        .from("offerwall_conversions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["approved", "completed"])
      offersCompletedCount = count ?? 0
    }
    const hasWithdrawalAch = achievements.some(a => a.requirement_type === "withdrawal_count")
    if (hasWithdrawalAch) {
      const { count } = await adminSupabase
        .from("withdrawals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "completed")
      withdrawalCount = count ?? 0
    }

    const newlyUnlocked: typeof achievements = []

    for (const ach of achievements) {
      if (completedIds.has(ach.id)) continue

      // Calculate progress based on requirement_type
      let progress = 0
      switch (ach.requirement_type) {
        case "claims":
          progress = profile.total_claims || 0
          break
        case "streak":
          progress = profile.max_claim_streak || profile.claim_streak || 0
          break
        case "earnings":
          progress = profile.total_earned_satoshis || 0
          break
        case "referrals":
          progress = profile.referral_count || 0
          break
        case "games_won":
          progress = gamesWonCount ?? 0
          break
        case "ptc_views":
          progress = ptcViewsCount ?? 0
          break
        case "offers_completed":
          progress = offersCompletedCount ?? 0
          break
        case "withdrawal_count":
          progress = withdrawalCount ?? 0
          break
        default:
          continue
      }

      if (progress >= ach.requirement_value) {
        // Mark as completed server-side
        const existingUa = (userAchs ?? []).find(ua => ua.achievement_id === ach.id)
        if (existingUa) {
          await adminSupabase
            .from("user_achievements")
            .update({ completed: true, completed_at: new Date().toISOString(), progress })
            .eq("user_id", user.id)
            .eq("achievement_id", ach.id)
        } else {
          await adminSupabase
            .from("user_achievements")
            .insert({
              user_id: user.id,
              achievement_id: ach.id,
              progress,
              completed: true,
              completed_at: new Date().toISOString(),
            })
        }
        newlyUnlocked.push(ach)
      }
    }

    return NextResponse.json({ newlyUnlocked })
  } catch (error) {
    console.error("[Achievement check] Error:", error)
    return NextResponse.json({ newlyUnlocked: [] })
  }
}
