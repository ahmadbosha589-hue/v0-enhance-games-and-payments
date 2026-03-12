import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"

const GAME_REWARD_SATOSHIS = 3 // Fixed 3 satoshis per win - no bonuses above this
const GAME_COOLDOWN_MINUTES = 3 // 3 minutes cooldown per game
const MIN_GAME_DURATION_MS = 15000 // Minimum 15 seconds to complete a game (stricter)
const MAX_GAME_DURATION_MS = 600000 // Maximum 10 minutes
const MAX_GAMES_PER_DAY = 20 // 20 games per day
const MAX_DAILY_GAME_EARNINGS = 60 // Max 60 satoshis from games per day (20 games x 3 sats)

// Required scores to WIN and get rewards (HIGHER thresholds - harder to win)
const WIN_THRESHOLDS: Record<string, number> = {
  tetris: 800,      // Increased from 500
  block_blast: 500, // Increased from 300
  car_racing: 800,  // Increased from 500
  snake: 80,        // Increased from 50
  flappy: 35,       // Increased from 20
  memory: 150,      // Increased from 100
}

// Score validation ranges for each game type
const SCORE_RANGES: Record<string, { min: number; max: number }> = {
  tetris: { min: 0, max: 1000000 },
  block_blast: { min: 0, max: 500000 },
  car_racing: { min: 0, max: 10000000 },
  snake: { min: 0, max: 50000 },
  flappy: { min: 0, max: 10000 },
  memory: { min: 0, max: 10000 },
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

    const body = await req.json()
    const {
      sessionId,
      sessionToken,
      score,
      challengeAnswer,
      gameData,
      fingerprint
    } = body

    if (!sessionId || !sessionToken || score === undefined || !challengeAnswer) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Fetch the game session
    const { data: session, error: sessionError } = await adminSupabase
      .from("game_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("session_token", sessionToken)
      .eq("status", "in_progress")
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 400 })
    }

    const verificationData = session.verification_data as {
      solution: string
      startTime: number
      fingerprint: string
      ip: string
    }
    const gameType = session.game_type as string

    // Verify challenge answer
    if (challengeAnswer !== verificationData.solution) {
      await adminSupabase
        .from("game_sessions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", sessionId)

      return NextResponse.json({ error: "Verification failed" }, { status: 400 })
    }

    // Verify game duration
    const gameDuration = Date.now() - verificationData.startTime
    if (gameDuration < MIN_GAME_DURATION_MS) {
      await adminSupabase
        .from("game_sessions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", sessionId)

      return NextResponse.json({
        error: "Game completed too quickly. Please play legitimately."
      }, { status: 400 })
    }

    if (gameDuration > MAX_GAME_DURATION_MS) {
      await adminSupabase
        .from("game_sessions")
        .update({
          status: "expired",
          completed_at: new Date().toISOString()
        })
        .eq("id", sessionId)

      return NextResponse.json({ error: "Game session expired" }, { status: 400 })
    }

    // Validate score range
    const scoreRange = SCORE_RANGES[gameType] || { min: 0, max: 1000000 }
    if (score < scoreRange.min || score > scoreRange.max) {
      await adminSupabase
        .from("game_sessions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", sessionId)

      return NextResponse.json({ error: "Invalid score" }, { status: 400 })
    }

    // Determine if user WON (reached win threshold)
    const winThreshold = WIN_THRESHOLDS[gameType] || 100
    const isWinner = score >= winThreshold
    // Fixed 3 satoshis per win - no bonuses, no multipliers
    // Users should use offerwalls and shortlinks for bigger rewards
    const rewardAmount = isWinner ? Math.min(GAME_REWARD_SATOSHIS, 3) : 0

    const today = new Date().toISOString().split("T")[0]
    const cooldownUntil = new Date(Date.now() + GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString()

    // Update game session with result
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

    // Set cooldown for THIS SPECIFIC GAME TYPE
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

    // Update daily limit
    const { data: existingLimit } = await adminSupabase
      .from("game_daily_limits")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    if (existingLimit) {
      await adminSupabase
        .from("game_daily_limits")
        .update({
          games_played: existingLimit.games_played + 1,
          total_earned: existingLimit.total_earned + rewardAmount
        })
        .eq("user_id", user.id)
        .eq("date", today)
    } else {
      await adminSupabase
        .from("game_daily_limits")
        .insert({
          user_id: user.id,
          date: today,
          games_played: 1,
          total_earned: rewardAmount
        })
    }

    // Award satoshis to user ONLY if they won
    if (isWinner) {
      // Get current balance
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("balance_satoshis")
        .eq("id", user.id)
        .single()

      const currentBalance = profile?.balance_satoshis || 0

      // Update balance directly
      await adminSupabase
        .from("profiles")
        .update({
          balance_satoshis: currentBalance + rewardAmount
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
    }

    // Get updated stats
    const { data: updatedLimit } = await adminSupabase
      .from("game_daily_limits")
      .select("games_played, total_earned")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    // Get updated balance
    const { data: updatedProfile } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis")
      .eq("id", user.id)
      .single()

    return NextResponse.json({
      success: true,
      isWinner,
      reward: rewardAmount,
      score,
      winThreshold,
      newBalance: updatedProfile?.balance_satoshis || 0,
      cooldownMinutes: GAME_COOLDOWN_MINUTES,
      cooldownUntil,
      gamesPlayedToday: updatedLimit?.games_played || 1,
      gamesRemaining: MAX_GAMES_PER_DAY - (updatedLimit?.games_played || 1),
      totalEarnedToday: updatedLimit?.total_earned || rewardAmount,
      message: isWinner
        ? `Congratulations! You earned ${rewardAmount} satoshis!`
        : `You need at least ${winThreshold} points to win. Try again!`
    })

  } catch (error) {
    console.error("Game complete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
