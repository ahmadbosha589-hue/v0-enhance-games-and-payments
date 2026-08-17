import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    // Two clients, deliberately:
    //  - `db` (service-role) reads the public leaderboard rows. It must not be
    //    used for auth: it carries no user session.
    //  - `authClient` (cookie-scoped) resolves WHO is asking, for their rank.
    // Using one client for both is how the rank silently became null.
    const db = requireAdminClient()
    const authClient = await createClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type") || "earnings"
    const period = searchParams.get("period") || "all"
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)

    let query = db.from("profiles").select("id, username, total_earned, total_claims, level, claim_streak")

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
    const { data: { user } } = authClient
      ? await authClient.auth.getUser()
      : { data: { user: null } }

    let userRank = null
    if (user) {
      const { data: userProfile } = await db
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
      // SECURITY (S6): `id` (the auth user UUID) is deliberately NOT returned.
      // It was previously emitted for the top 100 users on this PUBLIC endpoint,
      // which handed an attacker the exact user ids needed to target the forged
      // -cookie escalation (see lib/supabase/jwt-verify.ts / RC-1) and the
      // /api/2fa/validate brute-force oracle. Rank + username is all a
      // leaderboard needs; the client never used the id for anything else.
      leaderboard: leaderboard?.map((entry, index) => ({
        rank: index + 1,
        // Fallback label no longer derives from the UUID (that leaked 8 hex
        // chars of it). An anonymous positional label is sufficient.
        username: entry.username || `Player ${index + 1}`,
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
