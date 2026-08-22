import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type TournamentType = "faucet_claims" | "offerwall_earnings" | "highest_earners" | "supporter_ads_watched" | "supporter_earnings"
type TournamentPeriod = "daily" | "weekly" | "monthly"

function getPeriodDates(period: TournamentPeriod): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  switch (period) {
    case "daily":
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCHours(23, 59, 59, 999)
      break
    case "weekly": {
      const dayOfWeek = now.getUTCDay()
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      start.setUTCDate(now.getUTCDate() + diffToMonday)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCDate(start.getUTCDate() + 6)
      end.setUTCHours(23, 59, 59, 999)
      break
    }
    case "monthly":
      start.setUTCDate(1)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      end.setUTCHours(23, 59, 59, 999)
      break
  }

  return { start, end }
}

// Cross-user aggregation MUST use the service-role client: transactions RLS is
// `select_own` (auth.uid() = user_id), so a user-scoped client can only ever
// see its own rows and the "leaderboard" would show at most one player.
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: "Leaderboard temporarily unavailable" }, { status: 503 })
    }
    const { searchParams } = new URL(request.url)
    const tournamentId = searchParams.get("tournamentId")
    const type = searchParams.get("type") as TournamentType | null
    const period = searchParams.get("period") as TournamentPeriod | null
    const limit = parseInt(searchParams.get("limit") || "50")

    // Get current user (identity only — all data reads go through admin)
    const { data: { user } } = await supabase.auth.getUser()

    if (tournamentId) {
      // Get leaderboard for specific tournament (canonical participant columns)
      const { data: participants, error } = await admin
        .from("tournament_participants")
        .select(`
          user_id,
          score,
          final_rank,
          prize_won_satoshis,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("tournament_id", tournamentId)
        .order("score", { ascending: false })
        .limit(limit)

      if (error) {
        console.error("Error fetching tournament participants:", error)
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      const leaderboard = participants?.map((p, index) => ({
        user_id: p.user_id,
        username: (p.profiles as { username?: string })?.username || "Anonymous",
        avatar_url: (p.profiles as { avatar_url?: string })?.avatar_url,
        score: p.score,
        rank: p.final_rank ?? index + 1,
        prize_amount: p.prize_won_satoshis,
        is_current_user: p.user_id === user?.id,
      })) || []

      // Get current user's position if not in top
      let userPosition = null
      if (user && !leaderboard.some((p) => p.is_current_user)) {
        const { data: userParticipant } = await admin
          .from("tournament_participants")
          .select("score, final_rank")
          .eq("tournament_id", tournamentId)
          .eq("user_id", user.id)
          .single()

        if (userParticipant) {
          userPosition = {
            user_id: user.id,
            score: userParticipant.score,
            rank: userParticipant.final_rank ?? leaderboard.filter((p) => p.score > userParticipant.score).length + 1,
          }
        }
      }

      return NextResponse.json({ leaderboard, userPosition })
    }

    // Calculate live leaderboard based on type and period
    if (!type || !period) {
      return NextResponse.json({ error: "Type and period required" }, { status: 400 })
    }

    const { start, end } = getPeriodDates(period)

    let leaderboard: { user_id: string; username: string; avatar_url: string | null; score: number; rank: number; is_current_user: boolean }[] = []

    if (type === "faucet_claims") {
      // Count manual faucet claims (admin client sees all users' rows)
      const { data, error } = await admin
        .from("manual_faucet_claims")
        .select(`
          user_id,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .gte("claimed_at", start.toISOString())
        .lte("claimed_at", end.toISOString())

      if (error) {
        console.error("Error fetching faucet claims:", error)
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      // Aggregate by user
      const userCounts: Record<string, { count: number; username: string; avatar_url: string | null }> = {}
      data?.forEach((claim) => {
        const userId = claim.user_id
        if (!userCounts[userId]) {
          userCounts[userId] = {
            count: 0,
            username: (claim.profiles as { username?: string })?.username || "Anonymous",
            avatar_url: (claim.profiles as { avatar_url?: string })?.avatar_url || null,
          }
        }
        userCounts[userId].count++
      })

      leaderboard = Object.entries(userCounts)
        .map(([user_id, data]) => ({
          user_id,
          username: data.username,
          avatar_url: data.avatar_url,
          score: data.count,
          rank: 0,
          is_current_user: user_id === user?.id,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item, index) => ({ ...item, rank: index + 1 }))
    } else if (type === "supporter_ads_watched" || type === "supporter_earnings") {
      // No `support_us` transaction type exists in the ledger enum yet, so
      // there is no honest data source for supporter boards. Return an empty
      // leaderboard rather than querying a nonexistent enum value (500) or
      // fabricating scores.
      leaderboard = []
    } else {
      // offerwall_earnings / highest_earners — aggregate transactions.amount_satoshis
      // (the schema column; the old code selected a nonexistent `amount`).
      const typeFilter = type === "offerwall_earnings"
        ? { op: "eq" as const, value: "offerwall" }
        : { op: "in" as const, value: ["claim", "manual_faucet", "offerwall", "shortlink", "game", "ptc", "referral_bonus", "tournament_prize"] }

      let query = admin
        .from("transactions")
        .select(`
          user_id,
          amount_satoshis,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      query = typeFilter.op === "eq"
        ? query.eq("type", typeFilter.value as string)
        : query.in("type", typeFilter.value as string[])

      const { data, error } = await query

      if (error) {
        console.error("Error fetching earnings:", error)
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      // Aggregate by user
      const userEarnings: Record<string, { total: number; username: string; avatar_url: string | null }> = {}
      data?.forEach((tx) => {
        const userId = tx.user_id
        if (!userEarnings[userId]) {
          userEarnings[userId] = {
            total: 0,
            username: (tx.profiles as { username?: string })?.username || "Anonymous",
            avatar_url: (tx.profiles as { avatar_url?: string })?.avatar_url || null,
          }
        }
        userEarnings[userId].total += tx.amount_satoshis
      })

      leaderboard = Object.entries(userEarnings)
        .map(([user_id, data]) => ({
          user_id,
          username: data.username,
          avatar_url: data.avatar_url,
          score: data.total,
          rank: 0,
          is_current_user: user_id === user?.id,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item, index) => ({ ...item, rank: index + 1 }))
    }

    // Get current user's position if not in top
    let userPosition = null
    if (user && !leaderboard.some((p) => p.is_current_user) && type !== "supporter_ads_watched" && type !== "supporter_earnings") {
      // Find user's score based on type
      let userScore = 0

      if (type === "faucet_claims") {
        const { count } = await admin
          .from("manual_faucet_claims")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("claimed_at", start.toISOString())
          .lte("claimed_at", end.toISOString())
        userScore = count || 0
      } else {
        let q = admin
          .from("transactions")
          .select("amount_satoshis")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        if (type === "offerwall_earnings") {
          q = q.eq("type", "offerwall")
        } else {
          q = q.in("type", ["claim", "manual_faucet", "offerwall", "shortlink", "game", "ptc", "referral_bonus", "tournament_prize"])
        }

        const { data } = await q
        userScore = data?.reduce((sum, tx) => sum + tx.amount_satoshis, 0) || 0
      }

      if (userScore > 0) {
        // Count how many users have higher scores (within the fetched board)
        const higherCount = leaderboard.filter((p) => p.score > userScore).length
        userPosition = {
          user_id: user.id,
          score: userScore,
          rank: higherCount + 1,
        }
      }
    }

    return NextResponse.json({ leaderboard, userPosition })
  } catch (error) {
    console.error("Leaderboard API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
