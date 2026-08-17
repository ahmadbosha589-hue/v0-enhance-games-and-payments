import { NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import {
  calculateDifficulty,
  getAdjustedWinThreshold,
  MIN_GAME_DURATIONS_MS,
} from "@/lib/games/game-engine"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const GAME_REWARD_SATOSHIS = 3
const GAME_COOLDOWN_MINUTES = 3
const MAX_GAME_DURATION_MS = 600000 // 10 minutes
const MAX_GAMES_PER_DAY = 20
const MAX_DAILY_GAME_EARNINGS = 60

// Score validation ranges — upper bound is generous to avoid false rejects
const SCORE_RANGES: Record<string, { min: number; max: number }> = {
  tetris: { min: 0, max: 1_000_000 },
  block_blast: { min: 0, max: 500_000 },
  car_racing: { min: 0, max: 10_000_000 },
  snake: { min: 0, max: 50_000 },
  flappy: { min: 0, max: 10_000 },
  memory: { min: 0, max: 10_000 },
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const {
      sessionId,
      sessionToken,
      score,
      challengeAnswer,
      gameData,
      fingerprint,
      gameType: bodyGameType
    } = body

    if (!sessionId || !sessionToken || score === undefined || !challengeAnswer) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (err) {
      console.error("Failed to create admin client:", err)
      // Return success response without database tracking
      const gameType = bodyGameType || "unknown"
      // Difficulty unknown without DB — default to level 1
      const winThreshold = getAdjustedWinThreshold(gameType, 1)
      // Memory game: completing all pairs counts as a win (score > 0)
      const isWinner = gameType === "memory" ? score > 0 : score >= winThreshold
      return NextResponse.json({
        success: true,
        isWinner,
        reward: isWinner ? GAME_REWARD_SATOSHIS : 0,
        score,
        winThreshold: gameType === "memory" ? 0 : winThreshold,
        newBalance: 0,
        cooldownMinutes: GAME_COOLDOWN_MINUTES,
        cooldownUntil: new Date(Date.now() + GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString(),
        gamesPlayedToday: 1,
        gamesRemaining: MAX_GAMES_PER_DAY - 1,
        totalEarnedToday: isWinner ? GAME_REWARD_SATOSHIS : 0,
        message: isWinner
          ? `Congratulations! You earned ${GAME_REWARD_SATOSHIS} satoshis!`
          : gameType === "memory" ? "Match all pairs to win. Try again!" : `You need at least ${winThreshold} points to win. Try again!`
      })
    }

    // Fetch the game session
    let session = null
    let gameType = bodyGameType || "unknown"
    let verificationData: { solution: string; startTime: number } | null = null

    try {
      const { data, error: sessionError } = await adminSupabase
        .from("game_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .eq("session_token", sessionToken)
        .eq("status", "in_progress")
        .single()

      if (!sessionError && data) {
        session = data
        gameType = session.game_type as string
        verificationData = session.verification_data as { solution: string; startTime: number }
      }
    } catch (err) {
      console.error("Failed to fetch session:", err)
      // Continue without session validation
    }

    // If we have verification data, verify the challenge
    if (verificationData) {
      if (challengeAnswer !== verificationData.solution) {
        try {
          await adminSupabase
            .from("game_sessions")
            .update({
              status: "failed",
              completed_at: new Date().toISOString()
            })
            .eq("id", sessionId)
        } catch { /* ignore */ }

        return NextResponse.json({ error: "Verification failed" }, { status: 400 })
      }

      // Verify game duration — use per-game minimum so fast games (flappy, memory)
      // aren't unfairly rejected while still catching bots on slower games.
      const gameDuration = Date.now() - verificationData.startTime
      const minDurationMs = MIN_GAME_DURATIONS_MS[gameType] ?? 8000
      if (gameDuration < minDurationMs) {
        try {
          await adminSupabase
            .from("game_sessions")
            .update({
              status: "failed",
              completed_at: new Date().toISOString()
            })
            .eq("id", sessionId)
        } catch { /* ignore */ }

        return NextResponse.json({
          error: `Game completed too quickly (${Math.round(gameDuration / 1000)}s). Please play legitimately.`
        }, { status: 400 })
      }

      if (gameDuration > MAX_GAME_DURATION_MS) {
        try {
          await adminSupabase
            .from("game_sessions")
            .update({
              status: "expired",
              completed_at: new Date().toISOString()
            })
            .eq("id", sessionId)
        } catch { /* ignore */ }

        return NextResponse.json({ error: "Game session expired" }, { status: 400 })
      }
    }

    // Validate score range
    const scoreRange = SCORE_RANGES[gameType] || { min: 0, max: 1000000 }
    if (score < scoreRange.min || score > scoreRange.max) {
      try {
        await adminSupabase
          .from("game_sessions")
          .update({
            status: "failed",
            completed_at: new Date().toISOString()
          })
          .eq("id", sessionId)
      } catch { /* ignore */ }

      return NextResponse.json({ error: "Invalid score" }, { status: 400 })
    }

    // Determine if user WON using the SAME difficulty-adjusted threshold as the
    // status route.  Fetch today's completed/lost game count so we can compute
    // the correct difficulty level for this user right now.
    let gamesTodayForDifficulty = 0
    try {
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const { count } = await adminSupabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["completed", "lost"])
        .gte("created_at", todayStart.toISOString())
      gamesTodayForDifficulty = count ?? 0
    } catch { /* default to level 1 */ }

    const { level: difficultyLevel } = calculateDifficulty(gamesTodayForDifficulty)
    const winThreshold = getAdjustedWinThreshold(gameType, difficultyLevel)
    // Memory game: completing all pairs counts as a win (score > 0 means they finished)
    // Other games: must reach win threshold
    const isWinner = gameType === "memory" ? score > 0 : score >= winThreshold
    const rewardAmount = isWinner ? GAME_REWARD_SATOSHIS : 0

    const today = new Date().toISOString().split("T")[0]
    const cooldownUntil = new Date(Date.now() + GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString()

    // Calculate game duration for logging
    const gameDuration = verificationData ? Date.now() - verificationData.startTime : 0

    // Update game session with result - wrapped in try-catch
    try {
      await adminSupabase
        .from("game_sessions")
        .update({
          score,
          status: isWinner ? "completed" : "lost",
          reward_satoshis: rewardAmount,
          completed_at: new Date().toISOString(),
          game_duration_ms: gameDuration
        })
        .eq("id", sessionId)
    } catch { /* ignore session update errors */ }

    // Set cooldown for THIS SPECIFIC GAME TYPE - ONLY ON WIN
    // Players can immediately retry if they lose, but must wait after winning
    if (isWinner) {
      try {
        const { data: existingCooldown } = await adminSupabase
          .from("game_cooldowns")
          .select("id")
          .eq("user_id", user.id)
          .eq("game_type", gameType)
          .single()

        if (existingCooldown) {
          await adminSupabase
            .from("game_cooldowns")
            .update({ cooldown_until: cooldownUntil })
            .eq("user_id", user.id)
            .eq("game_type", gameType)
        } else {
          await adminSupabase
            .from("game_cooldowns")
            .insert({
              user_id: user.id,
              game_type: gameType,
              cooldown_until: cooldownUntil
            })
        }
      } catch { /* ignore cooldown errors */ }
    }

    // Update daily limit - ONLY COUNT WINS toward the 20 game limit
    // Losses don't count against the daily limit so players can keep trying
    let gamesPlayedToday = 0
    let totalEarnedToday = 0
    try {
      const { data: existingLimit } = await adminSupabase
        .from("game_daily_limits")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .single()

      if (existingLimit) {
        gamesPlayedToday = existingLimit.games_played
        totalEarnedToday = existingLimit.total_earned

        // Only increment games_played and total_earned on WIN
        if (isWinner) {
          gamesPlayedToday = existingLimit.games_played + 1
          totalEarnedToday = existingLimit.total_earned + rewardAmount
          await adminSupabase
            .from("game_daily_limits")
            .update({
              games_played: gamesPlayedToday,
              total_earned: totalEarnedToday
            })
            .eq("user_id", user.id)
            .eq("date", today)
        }
      } else if (isWinner) {
        // Only create record on first WIN
        gamesPlayedToday = 1
        totalEarnedToday = rewardAmount
        await adminSupabase
          .from("game_daily_limits")
          .insert({
            user_id: user.id,
            date: today,
            games_played: 1,
            total_earned: rewardAmount
          })
      }
    } catch { /* ignore daily limit errors */ }

    // Award satoshis to user ONLY if they won
    let newBalance = 0
    if (isWinner) {
      try {
        // Get current balance
        const { data: profile } = await adminSupabase
          .from("profiles")
          .select("balance_satoshis")
          .eq("id", user.id)
          .single()

        const currentBalance = profile?.balance_satoshis || 0
        newBalance = currentBalance + rewardAmount

        // Update balance directly
        await adminSupabase
          .from("profiles")
          .update({
            balance_satoshis: newBalance
          })
          .eq("id", user.id)

        // Create transaction record
        await adminSupabase
          .from("transactions")
          .insert({
            user_id: user.id,
            type: "game_reward",
            amount: rewardAmount,
            status: "completed",
            description: `Won ${gameType} game with score ${score}`
          })
      } catch (err) {
        console.error("Failed to award satoshis:", err)
        // Continue anyway
      }
    }

    return NextResponse.json({
      success: true,
      isWinner,
      reward: rewardAmount,
      score,
      winThreshold: gameType === "memory" ? 0 : winThreshold,
      newBalance,
      // Only include cooldown if player won - no cooldown on loss
      cooldownMinutes: isWinner ? GAME_COOLDOWN_MINUTES : 0,
      cooldownUntil: isWinner ? cooldownUntil : null,
      gamesPlayedToday,
      gamesRemaining: MAX_GAMES_PER_DAY - gamesPlayedToday,
      totalEarnedToday,
      message: isWinner
        ? `Congratulations! You earned ${rewardAmount} satoshis!`
        : gameType === "memory" ? "Match all pairs to win. Try again!" : `You need at least ${winThreshold} points to win. Try again!`
    })

  } catch (error) {
    console.error("Game complete error:", error)
    // Return a generic error response - we can't reference body variables here
    // as they may not be defined if the error occurred before parsing
    return NextResponse.json({
      success: false,
      isWinner: false,
      reward: 0,
      score: 0,
      winThreshold: getAdjustedWinThreshold(typeof bodyGameType === "string" ? bodyGameType : "unknown", 1),
      newBalance: 0,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      cooldownUntil: new Date(Date.now() + GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString(),
      gamesPlayedToday: 1,
      gamesRemaining: MAX_GAMES_PER_DAY - 1,
      totalEarnedToday: 0,
      message: "An error occurred. Please try again."
    })
  }
}
