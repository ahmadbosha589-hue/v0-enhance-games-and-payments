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
  // Keep this outside the outer try so the error response can safely include
  // the parsed game type even when a later operation fails.
  let bodyGameType: string | undefined

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
      gameType: destructuredGameType,
    } = body

    // The error handler can use this normalized string value.
    bodyGameType = typeof destructuredGameType === "string" ? destructuredGameType : undefined

    if (!sessionId || !sessionToken || score === undefined || !challengeAnswer) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (err) {
      console.error("Failed to create admin client:", err)
      return NextResponse.json({ error: "Game service is temporarily unavailable" }, { status: 503 })
    }

    // Fetch the game session
    let gameType = bodyGameType || "unknown"
    let verificationData: { solution: string; startTime: number } | null = null

    const { data: session, error: sessionError } = await adminSupabase
      .from("game_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user!.id)
      .eq("session_token", sessionToken)
      .eq("status", "in_progress")
      .single()

    if (sessionError || !session) {
      console.error("Failed to fetch game session:", sessionError)
      return NextResponse.json({ error: sessionError?.code === "PGRST116" ? "Invalid or expired game session" : "Game service is temporarily unavailable" }, { status: sessionError?.code === "PGRST116" ? 400 : 503 })
    }

    gameType = session.game_type as string
    verificationData = session.verification_data as { solution: string; startTime: number }

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
        .eq("user_id", user!.id)
        .in("status", ["completed", "lost"])
        .gte("created_at", todayStart.toISOString())
      gamesTodayForDifficulty = count ?? 0
    } catch { /* default to level 1 */ }

    const { level: difficultyLevel } = calculateDifficulty(gamesTodayForDifficulty)
    const winThreshold = getAdjustedWinThreshold(gameType, difficultyLevel)

    // Memory game win verification (anti-exploit): a partial score from an
    // expired timer must NOT pay. The client reports pairsMatched/pairsTotal/
    // completed; the server cross-checks against the score's implied pair
    // count. score>0 alone is not sufficient — the board must be complete.
    let isWinner: boolean
    if (gameType === "memory") {
      const memoryData = (gameData ?? {}) as {
        moves?: number
        pairsMatched?: number
        pairsTotal?: number
        completed?: boolean
      }
      const expectedPairsByScore = Math.floor(score / 10) // each pair is worth 10 base points
      const claimedPairs = memoryData.pairsMatched
      const claimedTotal = memoryData.pairsTotal

      // Valid win requires ALL of:
      //  - completed flag set by the game (timer expiry sets it false)
      //  - pairsMatched === pairsTotal (full board cleared)
      //  - pairsTotal within the known grid sizes (6/8/12)
      //  - score consistent with the claimed pair count (+/- perfect bonus)
      const plausiblePairs =
        typeof claimedPairs === "number" &&
        typeof claimedTotal === "number" &&
        claimedPairs === claimedTotal &&
        [6, 8, 12].includes(claimedTotal) &&
        score > 0 &&
        expectedPairsByScore >= claimedPairs - 3 && // combo/perfect bonuses keep score ahead of raw pairs
        expectedPairsByScore <= claimedPairs + 2

      isWinner = memoryData.completed === true && Boolean(plausiblePairs)
    } else {
      isWinner = score >= winThreshold
    }
    const rewardAmount = isWinner ? GAME_REWARD_SATOSHIS : 0

    const today = new Date().toISOString().split("T")[0]
    const cooldownUntil = new Date(Date.now() + GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString()

    // Calculate game duration for logging
    const gameDuration = verificationData ? Date.now() - verificationData.startTime : 0

    // Finalize through the atomic single-writer RPC. The legacy sequential
    // block below is intentionally unreachable until removed in cleanup; a
    // missing RPC returns 503 rather than issuing an unsafe fallback reward.
    const { data: atomicResult, error: atomicError } = await adminSupabase.rpc("complete_game_reward", {
      p_user_id: user!.id,
      p_session_id: sessionId,
      p_score: score,
      p_game_type: gameType,
      p_is_winner: isWinner,
      p_reward_satoshis: rewardAmount,
      p_game_duration_ms: gameDuration,
      p_cooldown_until: isWinner ? cooldownUntil : null,
    })

    if (atomicError || !atomicResult) {
      console.error("Atomic game finalization unavailable:", atomicError)
      return NextResponse.json({ error: "Game reward service is temporarily unavailable" }, { status: 503 })
    }

    if (!atomicResult.success) {
      const status = atomicResult.error === "DAILY_LIMIT" ? 429 : 400
      return NextResponse.json({ error: atomicResult.message || "Unable to finalize game" }, { status })
    }

    return NextResponse.json({
      success: true,
      isWinner: atomicResult.is_winner,
      reward: atomicResult.reward,
      score,
      winThreshold: gameType === "memory" ? 0 : winThreshold,
      newBalance: atomicResult.new_balance,
      cooldownMinutes: isWinner ? GAME_COOLDOWN_MINUTES : 0,
      cooldownUntil: atomicResult.cooldown_until,
      gamesPlayedToday: atomicResult.games_played_today,
      gamesRemaining: MAX_GAMES_PER_DAY - atomicResult.games_played_today,
      totalEarnedToday: atomicResult.total_earned_today,
      message: isWinner
        ? `Congratulations! You earned ${rewardAmount} satoshis!`
        : gameType === "memory" ? "Match all pairs to win. Try again!" : `You need at least ${winThreshold} points to win. Try again!`,
    })

    // Legacy sequential reward code removed: all production requests
    // finalize exclusively through the atomic complete_game_reward RPC above
    // (see scripts/089_game_cooldown_atomicity.sql).
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
    }, { status: 500 })
  }
}
