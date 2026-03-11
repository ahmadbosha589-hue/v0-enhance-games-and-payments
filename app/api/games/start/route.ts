import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import crypto from "crypto"

const GAME_COOLDOWN_MINUTES = 3
const MAX_GAMES_PER_DAY = 25
const VALID_GAME_TYPES = ["tetris", "block_blast", "car_racing"]

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

    const body = await req.json()
    const { gameType, fingerprint, screenResolution, timezone } = body

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return NextResponse.json({ error: "Invalid game type" }, { status: 400 })
    }

    // Validate fingerprint data for bot detection
    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 10) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    const today = new Date().toISOString().split("T")[0]

    // Check daily limit
    const { data: dailyLimit } = await adminSupabase
      .from("game_daily_limits")
      .select("games_played")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    if (dailyLimit && dailyLimit.games_played >= MAX_GAMES_PER_DAY) {
      return NextResponse.json({ 
        error: "Daily game limit reached",
        maxGames: MAX_GAMES_PER_DAY,
        gamesPlayed: dailyLimit.games_played
      }, { status: 429 })
    }

    // Check cooldown (last game must be at least 3 minutes ago)
    const cooldownTime = new Date(Date.now() - GAME_COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { data: recentGame } = await adminSupabase
      .from("game_sessions")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", cooldownTime)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (recentGame) {
      const lastGameTime = new Date(recentGame.created_at).getTime()
      const nextGameTime = lastGameTime + (GAME_COOLDOWN_MINUTES * 60 * 1000)
      const waitSeconds = Math.ceil((nextGameTime - Date.now()) / 1000)
      
      return NextResponse.json({ 
        error: "Please wait before playing again",
        waitSeconds,
        nextGameAt: new Date(nextGameTime).toISOString()
      }, { status: 429 })
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

    if (sessionError) {
      console.error("Error creating game session:", sessionError)
      return NextResponse.json({ error: "Failed to start game" }, { status: 500 })
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
