import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Tournament types and periods
type TournamentType = "faucet_claims" | "offerwall_earnings" | "highest_earners" | "supporter_ads_watched" | "supporter_earnings"
type TournamentPeriod = "daily" | "weekly" | "monthly"

interface TournamentConfig {
  type: TournamentType
  period: TournamentPeriod
  name: string
  description: string
  prize_pool: number
  prizes: { rank: number; percentage: number }[]
}

const TOURNAMENT_CONFIGS: TournamentConfig[] = [
  // Daily tournaments
  {
    type: "faucet_claims",
    period: "daily",
    name: "Daily Faucet Champion",
    description: "Claim the manual faucet the most times today",
    prize_pool: 5000,
    prizes: [
      { rank: 1, percentage: 50 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 20 },
    ],
  },
  {
    type: "offerwall_earnings",
    period: "daily",
    name: "Daily Offerwall Master",
    description: "Earn the most from offerwalls today",
    prize_pool: 10000,
    prizes: [
      { rank: 1, percentage: 50 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 20 },
    ],
  },
  {
    type: "highest_earners",
    period: "daily",
    name: "Daily Top Earner",
    description: "Earn the most overall today",
    prize_pool: 15000,
    prizes: [
      { rank: 1, percentage: 50 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 20 },
    ],
  },
  // Weekly tournaments
  {
    type: "faucet_claims",
    period: "weekly",
    name: "Weekly Faucet Champion",
    description: "Claim the manual faucet the most times this week",
    prize_pool: 25000,
    prizes: [
      { rank: 1, percentage: 40 },
      { rank: 2, percentage: 25 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 10 },
    ],
  },
  {
    type: "offerwall_earnings",
    period: "weekly",
    name: "Weekly Offerwall Master",
    description: "Earn the most from offerwalls this week",
    prize_pool: 50000,
    prizes: [
      { rank: 1, percentage: 40 },
      { rank: 2, percentage: 25 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 10 },
    ],
  },
  {
    type: "highest_earners",
    period: "weekly",
    name: "Weekly Top Earner",
    description: "Earn the most overall this week",
    prize_pool: 75000,
    prizes: [
      { rank: 1, percentage: 40 },
      { rank: 2, percentage: 25 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 10 },
    ],
  },
  // Monthly tournaments
  {
    type: "faucet_claims",
    period: "monthly",
    name: "Monthly Faucet Legend",
    description: "Claim the manual faucet the most times this month",
    prize_pool: 10000,
    prizes: [
      { rank: 1, percentage: 35 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 5 },
      { rank: 7, percentage: 4 },
      { rank: 8, percentage: 3 },
    ],
  },
  {
    type: "offerwall_earnings",
    period: "monthly",
    name: "Monthly Offerwall Legend",
    description: "Earn the most from offerwalls this month",
    prize_pool: 20000,
    prizes: [
      { rank: 1, percentage: 35 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 5 },
      { rank: 7, percentage: 4 },
      { rank: 8, percentage: 3 },
    ],
  },
  {
    type: "highest_earners",
    period: "monthly",
    name: "Monthly Grand Champion",
    description: "Earn the most overall this month",
    prize_pool: 30000,
    prizes: [
      { rank: 1, percentage: 35 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 5 },
      { rank: 7, percentage: 4 },
      { rank: 8, percentage: 3 },
    ],
  },
  // Support tournaments - Daily
  {
    type: "supporter_ads_watched",
    period: "daily",
    name: "Daily Support Champion",
    description: "Watch the most ads today to support the platform",
    prize_pool: 400,
    prizes: [
      { rank: 1, percentage: 50 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 20 },
    ],
  },
  {
    type: "supporter_earnings",
    period: "daily",
    name: "Daily Top Supporter",
    description: "Earn the most from supporting today",
    prize_pool: 600,
    prizes: [
      { rank: 1, percentage: 50 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 20 },
    ],
  },
  // Support tournaments - Weekly
  {
    type: "supporter_ads_watched",
    period: "weekly",
    name: "Weekly Support Champion",
    description: "Watch the most ads this week to support the platform",
    prize_pool: 2000,
    prizes: [
      { rank: 1, percentage: 40 },
      { rank: 2, percentage: 25 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 10 },
    ],
  },
  {
    type: "supporter_earnings",
    period: "weekly",
    name: "Weekly Top Supporter",
    description: "Earn the most from supporting this week",
    prize_pool: 3000,
    prizes: [
      { rank: 1, percentage: 40 },
      { rank: 2, percentage: 25 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 10 },
    ],
  },
  // Support tournaments - Monthly
  {
    type: "supporter_ads_watched",
    period: "monthly",
    name: "Monthly Support Legend",
    description: "Watch the most ads this month to support the platform",
    prize_pool: 8000,
    prizes: [
      { rank: 1, percentage: 35 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 5 },
      { rank: 7, percentage: 4 },
      { rank: 8, percentage: 3 },
    ],
  },
  {
    type: "supporter_earnings",
    period: "monthly",
    name: "Monthly Top Supporter Legend",
    description: "Earn the most from supporting this month",
    prize_pool: 12000,
    prizes: [
      { rank: 1, percentage: 35 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 5 },
      { rank: 7, percentage: 4 },
      { rank: 8, percentage: 3 },
    ],
  },
]

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
    const period = searchParams.get("period") as TournamentPeriod | null
    const type = searchParams.get("type") as TournamentType | null

    // Get user session
    const { data: { user } } = await supabase.auth.getUser()

    // Build query for active tournaments
    let query = supabase
      .from("tournaments")
      .select(`
        *,
        tournament_participants (
          user_id,
          score,
          rank,
          prize_amount,
          profiles:user_id (
            username,
            avatar_url
          )
        )
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })

    if (period) {
      query = query.eq("period", period)
    }
    if (type) {
      query = query.eq("type", type)
    }

    const { data: tournaments, error } = await query

    if (error) {
      console.error("Error fetching tournaments:", error)
      return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 })
    }

    // Get user's participation info
    let userParticipation: Record<string, { score: number; rank: number | null }> = {}
    if (user) {
      const { data: participation } = await supabase
        .from("tournament_participants")
        .select("tournament_id, score, rank")
        .eq("user_id", user.id)

      if (participation) {
        userParticipation = participation.reduce((acc, p) => {
          acc[p.tournament_id] = { score: p.score, rank: p.rank }
          return acc
        }, {} as Record<string, { score: number; rank: number | null }>)
      }
    }

    // Transform data
    const transformedTournaments = tournaments?.map((t) => ({
      ...t,
      leaderboard: (t.tournament_participants || [])
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 10)
        .map((p: { user_id: string; score: number; rank: number; profiles: { username: string; avatar_url: string } }, index: number) => ({
          user_id: p.user_id,
          username: p.profiles?.username || "Anonymous",
          avatar_url: p.profiles?.avatar_url,
          score: p.score,
          rank: index + 1,
        })),
      user_participation: userParticipation[t.id] || null,
      participant_count: (t.tournament_participants || []).length,
    }))

    return NextResponse.json({
      tournaments: transformedTournaments || [],
      configs: TOURNAMENT_CONFIGS,
    })
  } catch (error) {
    console.error("Tournament API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Admin endpoint to create/manage tournaments
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check admin status
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { action, tournamentId, config } = body

    if (action === "create") {
      // Create a new tournament from config
      const cfg = config as TournamentConfig
      const { start, end } = getPeriodDates(cfg.period)

      const { data: tournament, error } = await supabase
        .from("tournaments")
        .insert({
          type: cfg.type,
          period: cfg.period,
          name: cfg.name,
          description: cfg.description,
          prize_pool: cfg.prize_pool,
          prizes: cfg.prizes,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          status: "active",
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating tournament:", error)
        return NextResponse.json({ error: "Failed to create tournament" }, { status: 500 })
      }

      return NextResponse.json({ tournament })
    }

    if (action === "end" && tournamentId) {
      // End tournament AND distribute prizes. The admin client is required:
      // finalize_tournament is service-role only and credits winner balances.
      const admin = requireAdminClient()

      const { data: finalizeResult, error: finalizeError } = await admin.rpc(
        "finalize_tournament",
        { p_tournament_id: tournamentId },
      )

      if (finalizeError) {
        console.error("[Tournaments] Finalization failed:", finalizeError)
        return NextResponse.json(
          { error: "Failed to distribute prizes; tournament not marked complete", details: finalizeError.message },
          { status: 500 },
        )
      }

      const result = finalizeResult as
        | { success?: boolean; error?: string; already_completed?: boolean; winners_paid?: number; total_distributed?: number }
        | null

      if (!result?.success) {
        return NextResponse.json(
          { error: result?.error || "Prize distribution failed" },
          { status: 500 },
        )
      }

      return NextResponse.json({
        success: true,
        already_completed: result.already_completed ?? false,
        winners_paid: result.winners_paid ?? 0,
        total_distributed: result.total_distributed ?? 0,
      })
    }

    if (action === "create_all") {
      // Create all tournament types for the current periods
      const results = []

      for (const cfg of TOURNAMENT_CONFIGS) {
        const { start, end } = getPeriodDates(cfg.period)

        // Check if tournament already exists for this period
        const { data: existing } = await supabase
          .from("tournaments")
          .select("id")
          .eq("type", cfg.type)
          .eq("period", cfg.period)
          .eq("status", "active")
          .gte("starts_at", start.toISOString())
          .lte("ends_at", end.toISOString())
          .single()

        if (!existing) {
          const { data: tournament, error } = await supabase
            .from("tournaments")
            .insert({
              type: cfg.type,
              period: cfg.period,
              name: cfg.name,
              description: cfg.description,
              prize_pool: cfg.prize_pool,
              prizes: cfg.prizes,
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              status: "active",
            })
            .select()
            .single()

          if (!error && tournament) {
            results.push(tournament)
          }
        }
      }

      return NextResponse.json({ created: results.length, tournaments: results })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Tournament POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
