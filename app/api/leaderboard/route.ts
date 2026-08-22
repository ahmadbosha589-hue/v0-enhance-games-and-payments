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

    // Period filter: for time-boxed periods we aggregate real transactions
    // instead of lifetime profile totals, so the filter actually filters.
    if (period === "today" || period === "week" || period === "month") {
      const since = new Date()
      if (period === "today") {
        since.setUTCHours(0, 0, 0, 0)
      } else if (period === "week") {
        since.setTime(Date.now() - 7 * 24 * 60 * 60 * 1000)
      } else {
        since.setTime(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }

      const { data: agg, error: aggError } = await db
        .from("transactions")
        .select("user_id, amount_satoshis")
        .eq("status", "completed")
        .gte("created_at", since.toISOString())

      if (aggError) {
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      // Aggregate in JS: per-user earned sats within the window.
      const earnedByUser = new Map<string, number>()
      const claimsByUser = new Map<string, number>()
      for (const tx of agg ?? []) {
        earnedByUser.set(tx.user_id, (earnedByUser.get(tx.user_id) ?? 0) + Number(tx.amount_satoshis || 0))
        claimsByUser.set(tx.user_id, (claimsByUser.get(tx.user_id) ?? 0) + 1)
      }

      const topIds = [...earnedByUser.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id)

      if (topIds.length === 0) {
        return NextResponse.json({ leaderboard: [], userRank: null, period })
      }

      const { data: profiles, error: profilesError } = await db
        .from("profiles")
        .select("id, username, total_earned, total_claims, level, claim_streak")
        .in("id", topIds)

      if (profilesError) {
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const ranked = topIds
        .map((id) => {
          const p = profileById.get(id)
          if (!p) return null
          return {
            ...p,
            period_earned: earnedByUser.get(id) ?? 0,
            period_claims: claimsByUser.get(id) ?? 0,
          }
        })
        .filter(Boolean)

      // Current user's rank within the period window.
      let userRank = null
      const { data: { user } } = authClient
        ? await authClient.auth.getUser()
        : { data: { user: null } }
      if (user) {
        const earned = earnedByUser.get(user.id) ?? 0
        const rank = [...earnedByUser.entries()]
          .sort((a, b) => b[1] - a[1])
          .findIndex(([id]) => id === user.id)
        userRank = {
          id: undefined,
          username: (await db.from("profiles").select("username").eq("id", user.id).single()).data?.username ?? null,
          period_earned: earned,
          rank: rank >= 0 ? rank + 1 : null,
        }
      }

      return NextResponse.json({ leaderboard: ranked, userRank, period })
    }

    // Order by type (lifetime leaderboards)
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
