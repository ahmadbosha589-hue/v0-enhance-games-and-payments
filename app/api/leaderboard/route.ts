import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type") || "earnings"
    const period = searchParams.get("period") || "all"
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)

    let query = supabase.from("profiles").select("id, username, total_earned, total_claims, level, claim_streak")

    // Filter by period
    if (period === "today") {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      // For today's leaderboard, we'd need a different approach with transactions
      // Simplified: just use total for now
    } else if (period === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      // Similar limitation
    }

    // Order by type
    if (type === "earnings") {
      query = query.order("total_earned", { ascending: false })
    } else if (type === "claims") {
      query = query.order("total_claims", { ascending: false })
    } else if (type === "referrals") {
      query = query.order("referral_count", { ascending: false })
    } else if (type === "streak") {
      query = query.order("claim_streak", { ascending: false })
    }

    query = query.limit(limit)

    const { data: leaderboard, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
    }

    // Get current user's rank
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let userRank = null
    if (user) {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id, username, total_earned, total_claims, level")
        .eq("id", user.id)
        .single()

      if (userProfile) {
        // Find user's position (simplified)
        const rankIndex = leaderboard?.findIndex((p) => p.id === user.id) ?? -1
        userRank = {
          ...userProfile,
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
        }
      }
    }

    return NextResponse.json({
      leaderboard: leaderboard?.map((entry, index) => ({
        rank: index + 1,
        id: entry.id,
        username: entry.username || `User ${entry.id.slice(0, 8)}`,
        totalEarned: entry.total_earned,
        totalClaims: entry.total_claims,
        level: entry.level,
        streak: entry.claim_streak,
      })),
      userRank,
    })
  } catch (error) {
    console.error("Leaderboard error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
