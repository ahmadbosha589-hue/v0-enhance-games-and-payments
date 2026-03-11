import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

const GAME_COOLDOWN_MINUTES = 3
const MAX_GAMES_PER_DAY = 25
const GAME_REWARD_SATOSHIS = 3

export async function GET(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const today = new Date().toISOString().split("T")[0]

    // Get daily stats
    const { data: dailyLimit } = await adminSupabase
      .from("game_daily_limits")
      .select("games_played, total_earned")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    // Get last game time
    const { data: lastGame } = await adminSupabase
      .from("game_sessions")
      .select("created_at, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    // Calculate cooldown
    let canPlay = true
    let waitSeconds = 0
    let nextGameAt = null

    if (lastGame) {
      const lastGameTime = new Date(lastGame.created_at).getTime()
      const nextGameTime = lastGameTime + (GAME_COOLDOWN_MINUTES * 60 * 1000)
      
      if (Date.now() < nextGameTime) {
        canPlay = false
        waitSeconds = Math.ceil((nextGameTime - Date.now()) / 1000)
        nextGameAt = new Date(nextGameTime).toISOString()
      }
    }

    // Check daily limit
    const gamesPlayed = dailyLimit?.games_played || 0
    if (gamesPlayed >= MAX_GAMES_PER_DAY) {
      canPlay = false
    }

    // Get recent game history
    const { data: recentGames } = await adminSupabase
      .from("game_sessions")
      .select("id, game_type, score, reward_satoshis, status, created_at, completed_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(10)

    return NextResponse.json({
      canPlay,
      waitSeconds,
      nextGameAt,
      gamesPlayedToday: gamesPlayed,
      gamesRemaining: MAX_GAMES_PER_DAY - gamesPlayed,
      maxGamesPerDay: MAX_GAMES_PER_DAY,
      totalEarnedToday: dailyLimit?.total_earned || 0,
      rewardPerGame: GAME_REWARD_SATOSHIS,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      recentGames: recentGames || []
    })

  } catch (error) {
    console.error("Game status error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
