import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { log } from "@/lib/logger"

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
})

// Simple per-IP sliding window: max 3 submissions per hour. In-memory is
// acceptable here — the durable abuse signal is the DB row itself.
const recentByIp = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 3

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (recentByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    recentByIp.set(ip, recent)
    return true
  }
  recent.push(now)
  recentByIp.set(ip, recent)
  return false
}

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many messages sent. Please try again later." },
        { status: 429 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const parsed = contactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fill in all fields correctly.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { name, email, subject, message } = parsed.data
    const admin = requireAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: "Message service is temporarily unavailable." },
        { status: 503 },
      )
    }

    // Durable record first — success is only claimed after this succeeds.
    const { error: insertError } = await admin.from("contact_messages").insert({
      name,
      email,
      subject,
      message,
    })

    if (insertError) {
      log.error("[contact] insert failed", { error: insertError })
      return NextResponse.json(
        { error: "Failed to send your message. Please try again." },
        { status: 500 },
      )
    }

    // Best-effort email notification to the operator. Never blocks success:
    // the message is durably stored either way.
    const resendKey = process.env.RESEND_API_KEY?.trim()
    const notifyEmail = process.env.CONTACT_NOTIFICATION_EMAIL?.trim()

    if (resendKey && notifyEmail) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "onboarding@resend.dev",
            to: notifyEmail,
            reply_to: email,
            subject: `[Faucero contact] ${subject}`,
            text: `From: ${name} <${email}>\n\n${message}`,
          }),
          signal: AbortSignal.timeout(5000),
        })
      } catch (e) {
        log.warn("[contact] notification email failed (message still stored)", { error: e })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error("[contact] unexpected error", { error })
    return NextResponse.json(
      { error: "Failed to send your message. Please try again." },
      { status: 500 },
    )
  }
}
