import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"

const GAME_REWARD_SATOSHIS = 3
const MIN_GAME_DURATION_MS = 30000 // Minimum 30 seconds to complete a game
const MAX_GAME_DURATION_MS = 600000 // Maximum 10 minutes
const MAX_GAMES_PER_DAY = 25

// Score validation ranges for each game type
const SCORE_RANGES = {
  tetris: { min: 100, max: 100000 },
  block_blast: { min: 50, max: 50000 },
  car_racing: { min: 100, max: 1000000 }
}

// Game-specific move validation
const MOVE_RANGES = {
  tetris: { min: 10, max: 500 },
  block_blast: { min: 5, max: 200 },
  car_racing: { min: 20, max: 1000 }
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
    const userAgent = headersList.get("user-agent") || "unknown"

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

    const verificationData = session.verification_data as any
    const gameType = session.game_type as keyof typeof SCORE_RANGES

    // Verify challenge answer
    if (challengeAnswer !== verificationData.solution) {
      // Mark session as suspicious
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
    const scoreRange = SCORE_RANGES[gameType]
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

    // Validate game data (moves/actions)
    if (gameData && gameData.moves !== undefined) {
      const moveRange = MOVE_RANGES[gameType]
      if (gameData.moves < moveRange.min || gameData.moves > moveRange.max) {
        await adminSupabase
          .from("game_sessions")
          .update({ 
            status: "failed",
            completed_at: new Date().toISOString()
          })
          .eq("id", sessionId)

        return NextResponse.json({ error: "Suspicious gameplay detected" }, { status: 400 })
      }
    }

    // Verify IP and fingerprint consistency
    if (verificationData.ip !== ip || verificationData.fingerprint !== fingerprint) {
      await adminSupabase
        .from("game_sessions")
        .update({ 
          status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", sessionId)

      return NextResponse.json({ error: "Session verification failed" }, { status: 400 })
    }

    // All validations passed - complete the game and award satoshis
    const today = new Date().toISOString().split("T")[0]

    // Update game session
    const { error: updateError } = await adminSupabase
      .from("game_sessions")
      .update({ 
        score,
        status: "completed",
        reward_satoshis: GAME_REWARD_SATOSHIS,
        completed_at: new Date().toISOString(),
        game_duration_ms: gameDuration
      })
      .eq("id", sessionId)

    if (updateError) {
      console.error("Error updating game session:", updateError)
      return NextResponse.json({ error: "Failed to complete game" }, { status: 500 })
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
          total_earned: existingLimit.total_earned + GAME_REWARD_SATOSHIS
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
          total_earned: GAME_REWARD_SATOSHIS
        })
    }

    // Award satoshis to user
    const { error: balanceError } = await adminSupabase
      .from("profiles")
      .update({ 
        balance_satoshis: adminSupabase.rpc("increment_balance", { 
          user_id: user.id, 
          amount: GAME_REWARD_SATOSHIS 
        })
      })
      .eq("id", user.id)

    // Use RPC to safely increment balance
    await adminSupabase.rpc("add_game_reward", {
      p_user_id: user.id,
      p_amount: GAME_REWARD_SATOSHIS
    })

    // Get updated stats
    const { data: updatedLimit } = await adminSupabase
      .from("game_daily_limits")
      .select("games_played, total_earned")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    return NextResponse.json({
      success: true,
      reward: GAME_REWARD_SATOSHIS,
      score,
      gamesPlayedToday: updatedLimit?.games_played || 1,
      gamesRemaining: MAX_GAMES_PER_DAY - (updatedLimit?.games_played || 1),
      totalEarnedToday: updatedLimit?.total_earned || GAME_REWARD_SATOSHIS
    })

  } catch (error) {
    console.error("Game complete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
