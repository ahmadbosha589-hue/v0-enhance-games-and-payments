import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

/**
 * Telegram bot webhook.
 *
 * Connects the Faucero website to a Telegram bot:
 *   • /start           → welcome + the Mini App launch button (opens the site)
 *   • /link <token>    → links a Telegram chat to a Faucero account
 *   • /balance         → replies with the linked account's balance
 *   • /unlink          → removes the link
 *
 * SETUP (operator):
 *   1. Create a bot with @BotFather → get TELEGRAM_BOT_TOKEN
 *   2. Set the webhook:  https://api.telegram.org/bot<TOKEN>/setWebhook
 *     ?url=https://www.faucero.com/api/telegram/webhook
 *   3. Set TELEGRAM_BOT_TOKEN + NEXT_PUBLIC_TELEGRAM_BOT_USERNAME env vars
 *   4. Set the Mini App button URL in BotFather (Menu Button) to
 *      https://www.faucero.com/dashboard
 *
 * SECURITY: Telegram webhooks are authenticated via a secret token header
 * (X-Telegram-Bot-Api-Secret-Token set in setWebhook). If TELEGRAM_WEBHOOK_SECRET
 * is configured, requests without the matching header are refused.
 */

const TELEGRAM_API = "https://api.telegram.org"

async function tg(method: string, payload: Record<string, unknown>): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

function helpText(botUsername: string): string {
  return [
    "Faucero bot commands:",
    "/start — open Faucero and link this chat",
    "/link <token> — link this chat to your Faucero account (get the token from Dashboard → Settings)",
    "/balance — your current balance",
    "/unlink — unlink this chat",
  ].join("\n") + (botUsername ? `\n\nOpen the app: https://t.me/${botUsername}` : "")
}

export async function POST(request: NextRequest) {
  try {
    // Webhook secret verification (set via setWebhook secret_token).
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
      const received = request.headers.get("x-telegram-bot-api-secret-token")
      if (received !== secret) {
        log.warn("Telegram webhook secret mismatch")
        return NextResponse.json({ ok: false }, { status: 401 })
      }
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ ok: true }) // nothing to do; ack the bot
    }

    const update = await request.json().catch(() => null)
    const message = update?.message
    const chatId = message?.chat?.id
    const text: string = (message?.text || "").trim()

    if (!chatId || !text) {
      return NextResponse.json({ ok: true })
    }

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ""

    if (text.startsWith("/start")) {
      // Deep-link payloads look like /start link_<token>.
      const linkToken = text.split(" ")[1]?.replace(/^link_/, "")
      if (linkToken) {
        await handleLink(adminSupabase, chatId, linkToken, botUsername)
        return NextResponse.json({ ok: true })
      }
      await tg("sendMessage", {
        chat_id: chatId,
        text: `Welcome to Faucero! 🚀\n\nEarn free satoshis every 5 minutes, complete offers, and withdraw to FaucetPay.\n\n${helpText(botUsername)}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open Faucero", web_app: { url: process.env.NEXT_PUBLIC_APP_URL || "https://www.faucero.com" } }],
          ],
        },
      })
      return NextResponse.json({ ok: true })
    }

    if (text.startsWith("/link ")) {
      const linkToken = text.slice("/link ".length).trim().replace(/^link_/, "")
      await handleLink(adminSupabase, chatId, linkToken, botUsername)
      return NextResponse.json({ ok: true })
    }

    if (text === "/balance") {
      const { data: link } = await adminSupabase
        .from("telegram_links")
        .select("user_id")
        .eq("chat_id", String(chatId))
        .maybeSingle()

      if (!link) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "No Faucero account is linked to this chat. Use /link <token> first.",
        })
        return NextResponse.json({ ok: true })
      }

      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("username, display_name, balance_satoshis")
        .eq("id", link.user_id)
        .single()

      await tg("sendMessage", {
        chat_id: chatId,
        text: profile
          ? `${profile.display_name || profile.username || "User"} — balance: ${Number(profile.balance_satoshis || 0).toLocaleString()} satoshis`
          : "Profile not found.",
      })
      return NextResponse.json({ ok: true })
    }

    if (text === "/unlink") {
      await adminSupabase.from("telegram_links").delete().eq("chat_id", String(chatId))
      await tg("sendMessage", { chat_id: chatId, text: "This chat has been unlinked from Faucero." })
      return NextResponse.json({ ok: true })
    }

    await tg("sendMessage", { chat_id: chatId, text: helpText(botUsername) })
    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error("Telegram webhook error", error instanceof Error ? error : new Error(String(error)))
    // Always ack so Telegram does not retry forever.
    return NextResponse.json({ ok: true })
  }
}

async function handleLink(
  adminSupabase: NonNullable<ReturnType<typeof createAdminClient>>,
  chatId: number,
  token: string,
  botUsername: string,
) {
  if (!token) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Usage: /link <token> — get the token from Dashboard → Settings on faucero.com.",
    })
    return
  }

  // The token is a one-time code stored in the user's profile row.
  const { data: profile, error } = await adminSupabase
    .from("profiles")
    .select("id, username, display_name, telegram_link_token")
    .eq("telegram_link_token", token)
    .maybeSingle()

  if (error || !profile) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Invalid or expired token. Generate a new one in Dashboard → Settings.",
    })
    return
  }

  await adminSupabase
    .from("profiles")
    .update({ telegram_chat_id: String(chatId), telegram_link_token: null })
    .eq("id", profile.id)

  await adminSupabase.from("telegram_links").upsert(
    { chat_id: String(chatId), user_id: profile.id, linked_at: new Date().toISOString() },
    { onConflict: "chat_id" },
  )

  await tg("sendMessage", {
    chat_id: chatId,
    text: `✅ Linked! This chat now belongs to ${profile.display_name || profile.username || "your"} Faucero account.\n\n${helpText(botUsername)}`,
  })
}

// GET health — confirms the webhook is deployed.
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.TELEGRAM_BOT_TOKEN,
    bot: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null,
  })
}