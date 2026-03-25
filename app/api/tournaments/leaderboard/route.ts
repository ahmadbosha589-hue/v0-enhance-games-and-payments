import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type TournamentType = "faucet_claims" | "offerwall_earnings" | "highest_earners"
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
    case "weekly":
      const dayOfWeek = now.getUTCDay()
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      start.setUTCDate(now.getUTCDate() + diffToMonday)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCDate(start.getUTCDate() + 6)
      end.setUTCHours(23, 59, 59, 999)
      break
    case "monthly":
      start.setUTCDate(1)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      end.setUTCHours(23, 59, 59, 999)
      break
  }

  return { start, end }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const tournamentId = searchParams.get("tournamentId")
    const type = searchParams.get("type") as TournamentType | null
    const period = searchParams.get("period") as TournamentPeriod | null
    const limit = parseInt(searchParams.get("limit") || "50")

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (tournamentId) {
      // Get leaderboard for specific tournament
      const { data: participants, error } = await supabase
        .from("tournament_participants")
        .select(`
          user_id,
          score,
          rank,
          prize_amount,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("tournament_id", tournamentId)
        .order("score", { ascending: false })
        .limit(limit)

      if (error) {
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 })
      }

      const leaderboard = participants?.map((p, index) => ({
        user_id: p.user_id,
        username: (p.profiles as { username?: string })?.username || "Anonymous",
        avatar_url: (p.profiles as { avatar_url?: string })?.avatar_url,
        score: p.score,
        rank: index + 1,
        prize_amount: p.prize_amount,
        is_current_user: p.user_id === user?.id,
      }))

      // Get current user's position if not in top
      let userPosition = null
      if (user && !leaderboard?.some((p) => p.is_current_user)) {
        const { data: userParticipant } = await supabase
          .from("tournament_participants")
          .select("score, rank")
          .eq("tournament_id", tournamentId)
          .eq("user_id", user.id)
          .single()

        if (userParticipant) {
          // Count how many users have higher scores
          const { count } = await supabase
            .from("tournament_participants")
            .select("*", { count: "exact", head: true })
            .eq("tournament_id", tournamentId)
            .gt("score", userParticipant.score)

          userPosition = {
            user_id: user.id,
            score: userParticipant.score,
            rank: (count || 0) + 1,
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
      // Count manual faucet claims
      const { data, error } = await supabase
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
    } else if (type === "offerwall_earnings") {
      // Sum offerwall earnings from transactions
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          user_id,
          amount,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("type", "offerwall")
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      if (error) {
        console.error("Error fetching offerwall earnings:", error)
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
        userEarnings[userId].total += tx.amount
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
    } else if (type === "highest_earners") {
      // Sum all earnings from transactions
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          user_id,
          amount,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .in("type", ["faucet", "manual_faucet", "offerwall", "shortlink", "game", "ptc", "referral", "tournament_prize"])
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

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
        userEarnings[userId].total += tx.amount
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
    if (user && !leaderboard.some((p) => p.is_current_user)) {
      // Find user's score based on type
      let userScore = 0

      if (type === "faucet_claims") {
        const { count } = await supabase
          .from("manual_faucet_claims")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("claimed_at", start.toISOString())
          .lte("claimed_at", end.toISOString())
        userScore = count || 0
      } else if (type === "offerwall_earnings") {
        const { data } = await supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", user.id)
          .eq("type", "offerwall")
          .eq("status", "completed")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
        userScore = data?.reduce((sum, tx) => sum + tx.amount, 0) || 0
      } else if (type === "highest_earners") {
        const { data } = await supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", user.id)
          .in("type", ["faucet", "manual_faucet", "offerwall", "shortlink", "game", "ptc", "referral", "tournament_prize"])
          .eq("status", "completed")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
        userScore = data?.reduce((sum, tx) => sum + tx.amount, 0) || 0
      }

      if (userScore > 0) {
        // Count how many users have higher scores
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
