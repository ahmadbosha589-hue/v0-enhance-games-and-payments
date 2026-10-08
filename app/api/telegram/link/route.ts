import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

/**
 * Telegram link token management.
 *
 * GET  → returns whether a Telegram chat is linked, plus a fresh one-time
 *        link token (generated server-side, never guessable).
 * POST → regenerates the token (invalidates the previous one).
 *
 * The user sends `/link <token>` to the bot; the bot redeems the token and
 * links the chat. Tokens are single-use and nulled after redemption.
 */

function generateToken(): string {
  // 24 hex chars = 96 bits of entropy — unguessable, single-use.
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 })

    const { data: profile } = await admin
      .from("profiles")
      .select("telegram_chat_id, telegram_link_token")
      .eq("id", user.id)
      .single()

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ""

    return NextResponse.json({
      linked: !!profile?.telegram_chat_id,
      chatId: profile?.telegram_chat_id || null,
      token: profile?.telegram_link_token || null,
      botUsername,
      // Deep link that pre-fills /start with the token.
      deepLink: profile?.telegram_link_token && botUsername
        ? `https://t.me/${botUsername}?start=link_${profile.telegram_link_token}`
        : null,
    })
  } catch (error) {
    log.error("telegram link GET error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 })

    const token = generateToken()
    const { error } = await admin
      .from("profiles")
      .update({ telegram_link_token: token })
      .eq("id", user.id)

    if (error) {
      log.error("telegram link token write failed", error)
      return NextResponse.json({ error: "Failed to generate token" }, { status: 500 })
    }

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ""
    log.info("telegram link token generated", { userId: user.id })

    return NextResponse.json({
      success: true,
      token,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=link_${token}` : null,
      message: "Send /link with this token to the bot, or open the deep link.",
    })
  } catch (error) {
    log.error("telegram link POST error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}