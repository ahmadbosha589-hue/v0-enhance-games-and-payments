import { NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { calculateDifficulty, BASE_WIN_THRESHOLDS, getAdjustedWinThreshold } from "@/lib/games/game-engine"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const GAME_COOLDOWN_MINUTES = 3
const MAX_GAMES_PER_DAY = 20
const GAME_REWARD_SATOSHIS = 3

const ALL_GAME_TYPES = ["tetris", "block_blast", "car_racing", "snake", "flappy", "memory"]

export async function GET(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (err) {
      console.error("Failed to create admin client:", err)
      // Return default response without database
      const defaultStatus: Record<string, { canPlay: boolean; waitSeconds: number; cooldownUntil: string | null; winThreshold: number }> = {}
      for (const gameType of ALL_GAME_TYPES) {
        defaultStatus[gameType] = {
          canPlay: true,
          waitSeconds: 0,
          cooldownUntil: null,
          winThreshold: BASE_WIN_THRESHOLDS[gameType] || 100
        }
      }
      return NextResponse.json({
        gameStatuses: defaultStatus,
        gamesPlayedToday: 0,
        gamesRemaining: MAX_GAMES_PER_DAY,
        maxGamesPerDay: MAX_GAMES_PER_DAY,
        totalEarnedToday: 0,
        rewardPerGame: GAME_REWARD_SATOSHIS,
        cooldownMinutes: GAME_COOLDOWN_MINUTES,
        currentBalance: 0,
        recentGames: [],
        winThresholds: BASE_WIN_THRESHOLDS,
        difficulty: {
          level: 1,
          description: "Easy",
          speedMultiplier: 1,
          obstacleFrequency: 1,
          bonusChance: 0.15,
          scoreMultiplier: 1
        },
        gamesToday: 0
      })
    }

    const today = new Date().toISOString().split("T")[0]

    // Get daily stats - handle errors gracefully
    let dailyLimit = null
    try {
      const { data } = await adminSupabase
        .from("game_daily_limits")
        .select("games_played, total_earned")
        .eq("user_id", user.id)
        .eq("date", today)
        .single()
      dailyLimit = data
    } catch { /* ignore */ }

    // Get TODAY's games played for difficulty calculation (resets daily)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    let gamesTodayCount = 0
    try {
      const { count } = await adminSupabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["completed", "lost"])
        .gte("created_at", todayStart.toISOString())
      gamesTodayCount = count || 0
    } catch { /* ignore */ }

    // Calculate difficulty based on TODAY's games played (resets every 24 hours)
    const difficulty = calculateDifficulty(gamesTodayCount)

    // Get all game cooldowns for this user
    let cooldowns: Array<{ game_type: string; cooldown_until: string }> | null = null
    try {
      const { data } = await adminSupabase
        .from("game_cooldowns")
        .select("game_type, cooldown_until")
        .eq("user_id", user.id)
      cooldowns = data
    } catch { /* ignore */ }

    // Build per-game status with difficulty-adjusted win thresholds
    const gameStatuses: Record<string, {
      canPlay: boolean
      waitSeconds: number
      cooldownUntil: string | null
      winThreshold: number
    }> = {}

    // Calculate win thresholds adjusted by difficulty
    // Use the shared helper so status and complete routes always agree
    const adjustedWinThresholds: Record<string, number> = {}
    for (const gameType of ALL_GAME_TYPES) {
      adjustedWinThresholds[gameType] = getAdjustedWinThreshold(gameType, difficulty.level)
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
    let recentGames: Array<{ id: string; game_type: string; score: number; reward_satoshis: number; status: string; created_at: string }> = []
    try {
      const { data } = await adminSupabase
        .from("game_sessions")
        .select("id, game_type, score, reward_satoshis, status, created_at, completed_at")
        .eq("user_id", user.id)
        .in("status", ["completed", "lost"])
        .order("created_at", { ascending: false })
        .limit(20)
      recentGames = data || []
    } catch { /* ignore */ }

    // Get user's current balance
    let currentBalance = 0
    try {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("balance_satoshis")
        .eq("id", user.id)
        .single()
      currentBalance = profile?.balance_satoshis || 0
    } catch { /* ignore */ }

    return NextResponse.json({
      gameStatuses,
      gamesPlayedToday: dailyLimit?.games_played || 0,
      gamesRemaining: MAX_GAMES_PER_DAY - (dailyLimit?.games_played || 0),
      maxGamesPerDay: MAX_GAMES_PER_DAY,
      totalEarnedToday: dailyLimit?.total_earned || 0,
      rewardPerGame: GAME_REWARD_SATOSHIS,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      currentBalance,
      recentGames,
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
      gamesToday: gamesTodayCount
    })

  } catch (error) {
    console.error("Game status error:", error)
    // Return default response on error
    const defaultStatus: Record<string, { canPlay: boolean; waitSeconds: number; cooldownUntil: string | null; winThreshold: number }> = {}
    for (const gameType of ALL_GAME_TYPES) {
      defaultStatus[gameType] = {
        canPlay: true,
        waitSeconds: 0,
        cooldownUntil: null,
        winThreshold: BASE_WIN_THRESHOLDS[gameType] || 100
      }
    }
    return NextResponse.json({
      gameStatuses: defaultStatus,
      gamesPlayedToday: 0,
      gamesRemaining: MAX_GAMES_PER_DAY,
      maxGamesPerDay: MAX_GAMES_PER_DAY,
      totalEarnedToday: 0,
      rewardPerGame: GAME_REWARD_SATOSHIS,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      currentBalance: 0,
      recentGames: [],
      winThresholds: BASE_WIN_THRESHOLDS,
      difficulty: {
        level: 1,
        description: "Easy",
        speedMultiplier: 1,
        obstacleFrequency: 1,
        bonusChance: 0.15,
        scoreMultiplier: 1
      },
      gamesToday: 0
    })
  }
}
