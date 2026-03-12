import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { calculateDifficulty } from "@/lib/games/game-engine"

const GAME_COOLDOWN_MINUTES = 3 // 3 minutes cooldown per game
const MAX_GAMES_PER_DAY = 20 // 20 games per day
const GAME_REWARD_SATOSHIS = 3 // Base reward - max 3 satoshis per game win

const ALL_GAME_TYPES = ["tetris", "block_blast", "car_racing", "snake", "flappy", "memory"]

// Base win thresholds for each game (will be adjusted by difficulty)
const BASE_WIN_THRESHOLDS: Record<string, number> = {
  tetris: 300,
  block_blast: 200,
  car_racing: 300,
  snake: 30,
  flappy: 10,
  memory: 80,
}

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

    // Get TODAY's games played for difficulty calculation (resets daily)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count: gamesTodayCount } = await adminSupabase
      .from("game_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["completed", "lost"])
      .gte("created_at", todayStart.toISOString())

    // Calculate difficulty based on TODAY's games played (resets every 24 hours)
    const difficulty = calculateDifficulty(gamesTodayCount || 0)

    // Get all game cooldowns for this user
    const { data: cooldowns } = await adminSupabase
      .from("game_cooldowns")
      .select("game_type, cooldown_until")
      .eq("user_id", user.id)

    // Build per-game status with difficulty-adjusted win thresholds
    const gameStatuses: Record<string, {
      canPlay: boolean
      waitSeconds: number
      cooldownUntil: string | null
      winThreshold: number
    }> = {}

    // Calculate win thresholds adjusted by difficulty
    const adjustedWinThresholds: Record<string, number> = {}
    for (const gameType of ALL_GAME_TYPES) {
      // Win threshold increases with difficulty (but reward also increases)
      const baseThreshold = BASE_WIN_THRESHOLDS[gameType] || 100
      adjustedWinThresholds[gameType] = Math.floor(baseThreshold * (1 + (difficulty.level - 1) * 0.1))
    }

    const now = Date.now()

    for (const gameType of ALL_GAME_TYPES) {
      const cooldown = cooldowns?.find(c => c.game_type === gameType)
      let canPlay = true
      let waitSeconds = 0
      let cooldownUntil: string | null = null

      if (cooldown) {
        const cooldownTime = new Date(cooldown.cooldown_until).getTime()
        if (now < cooldownTime) {
          canPlay = false
          waitSeconds = Math.ceil((cooldownTime - now) / 1000)
          cooldownUntil = cooldown.cooldown_until
        }
      }

      // Check daily limit
      const gamesPlayed = dailyLimit?.games_played || 0
      if (gamesPlayed >= MAX_GAMES_PER_DAY) {
        canPlay = false
      }

      gameStatuses[gameType] = {
        canPlay,
        waitSeconds,
        cooldownUntil,
        winThreshold: adjustedWinThresholds[gameType] || 100
      }
    }

    // Get recent game history
    const { data: recentGames } = await adminSupabase
      .from("game_sessions")
      .select("id, game_type, score, reward_satoshis, status, created_at, completed_at")
      .eq("user_id", user.id)
      .in("status", ["completed", "lost"])
      .order("created_at", { ascending: false })
      .limit(20)

    // Get user's current balance
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis")
      .eq("id", user.id)
      .single()

    return NextResponse.json({
      gameStatuses,
      gamesPlayedToday: dailyLimit?.games_played || 0,
      gamesRemaining: MAX_GAMES_PER_DAY - (dailyLimit?.games_played || 0),
      maxGamesPerDay: MAX_GAMES_PER_DAY,
      totalEarnedToday: dailyLimit?.total_earned || 0,
      rewardPerGame: GAME_REWARD_SATOSHIS,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      currentBalance: profile?.balance_satoshis || 0,
      recentGames: recentGames || [],
      winThresholds: adjustedWinThresholds,
      // Difficulty information (resets daily at midnight UTC)
      difficulty: {
        level: difficulty.level,
        description: difficulty.description,
        speedMultiplier: difficulty.speedMultiplier,
        obstacleFrequency: difficulty.obstacleFrequency,
        bonusChance: difficulty.bonusChance,
        scoreMultiplier: difficulty.scoreMultiplier,
        resetsIn: difficulty.resetsIn // Time until daily reset
      },
      gamesToday: gamesTodayCount || 0
    })

  } catch (error) {
    console.error("Game status error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
