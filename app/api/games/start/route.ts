import { NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import crypto from "crypto"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const GAME_COOLDOWN_MINUTES = 3 // 3 minutes cooldown per game
const MAX_GAMES_PER_DAY = 20 // 20 games per day
const VALID_GAME_TYPES = ["tetris", "block_blast", "car_racing", "snake", "memory", "flappy"]

// Generate a cryptographic challenge for anti-bot validation
function generateChallenge(): { challenge: string; solution: string } {
  const a = Math.floor(Math.random() * 50) + 10
  const b = Math.floor(Math.random() * 50) + 10
  const solution = (a + b).toString()
  const challenge = crypto.randomBytes(16).toString("hex")
  return { challenge: `${challenge}:${a}:${b}`, solution }
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

    // Basic bot detection
    if (userAgent.toLowerCase().includes("bot") ||
      userAgent.toLowerCase().includes("crawler") ||
      userAgent.toLowerCase().includes("spider")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { gameType, fingerprint, screenResolution, timezone } = body

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return NextResponse.json({ error: "Invalid game type" }, { status: 400 })
    }

    // Validate fingerprint data for bot detection
    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 10) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    let adminSupabase
    try {
      adminSupabase = requireAdminClient()
    } catch (err) {
      console.error("Failed to create admin client:", err)
      return NextResponse.json({ error: "Game service is temporarily unavailable" }, { status: 503 })
    }

    const today = new Date().toISOString().split("T")[0]

    const { data: dailyLimit, error: dailyLimitError } = await adminSupabase
      .from("game_daily_limits")
      .select("games_played")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    if (dailyLimitError && dailyLimitError.code !== "PGRST116") {
      console.error("Failed to read daily game limit:", dailyLimitError)
      return NextResponse.json({ error: "Game limits are temporarily unavailable" }, { status: 503 })
    }

    if (dailyLimit && dailyLimit.games_played >= MAX_GAMES_PER_DAY) {
      return NextResponse.json({
        error: "Daily game limit reached",
        maxGames: MAX_GAMES_PER_DAY,
        gamesPlayed: dailyLimit.games_played
      }, { status: 429 })
    }

    const { data: cooldown, error: cooldownError } = await adminSupabase
      .from("game_cooldowns")
      .select("cooldown_until")
      .eq("user_id", user.id)
      .eq("game_type", gameType)
      .single()

    if (cooldownError && cooldownError.code !== "PGRST116") {
      console.error("Failed to read game cooldown:", cooldownError)
      return NextResponse.json({ error: "Game cooldowns are temporarily unavailable" }, { status: 503 })
    }

    if (cooldown) {
      const cooldownUntil = new Date(cooldown.cooldown_until).getTime()
      const now = Date.now()

      if (now < cooldownUntil) {
        const waitSeconds = Math.ceil((cooldownUntil - now) / 1000)
        return NextResponse.json({
          error: `Please wait before playing ${gameType} again`,
          waitSeconds,
          nextGameAt: cooldown.cooldown_until,
          gameType
        }, { status: 429 })
      }
    }

    const { data: existingSession, error: existingSessionError } = await adminSupabase
      .from("game_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("game_type", gameType)
      .eq("status", "in_progress")
      .maybeSingle()

    if (existingSessionError) {
      console.error("Failed to inspect game sessions:", existingSessionError)
      return NextResponse.json({ error: "Game sessions are temporarily unavailable" }, { status: 503 })
    }

    if (existingSession) {
      await adminSupabase
        .from("game_sessions")
        .update({ status: "expired", completed_at: new Date().toISOString() })
        .eq("id", existingSession.id)
    }

    // Generate challenge for anti-bot verification
    const { challenge, solution } = generateChallenge()

    // Create game session with server-side tracking
    const sessionToken = crypto.randomBytes(32).toString("hex")
    const gameStartTime = Date.now()

    // Store verification data server-side
    const verificationData = {
      solution,
      startTime: gameStartTime,
      fingerprint,
      ip,
      userAgent,
      screenResolution,
      timezone
    }

    const { data: session, error: sessionError } = await adminSupabase
      .from("game_sessions")
      .insert({
        user_id: user.id,
        game_type: gameType,
        session_token: sessionToken,
        verification_data: verificationData,
        ip_address: ip,
        user_agent: userAgent,
        status: "in_progress"
      })
      .select("id")
      .single()

    if (sessionError || !session) {
      console.error("Error creating game session:", sessionError)
      return NextResponse.json({ error: "Unable to create a tracked game session" }, { status: 503 })
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      sessionToken,
      challenge,
      gameType,
      gamesPlayedToday: (dailyLimit?.games_played || 0),
      gamesRemaining: MAX_GAMES_PER_DAY - (dailyLimit?.games_played || 0),
      cooldownMinutes: GAME_COOLDOWN_MINUTES
    })

  } catch (error) {
    console.error("Game start error:", error)
    return NextResponse.json({ error: "Game service is temporarily unavailable" }, { status: 503 })
  }
}
