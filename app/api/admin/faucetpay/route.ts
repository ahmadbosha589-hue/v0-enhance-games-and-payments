import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"
import { clearFaucetPayApiKeyCache } from "@/lib/faucetpay/client"

const ADMIN_ROLES = ["admin", "superadmin"]
const FAUCETPAY_API_URL = "https://faucetpay.io/api/v1"
const SETTINGS_KEY = "faucetpay_api_key"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !ADMIN_ROLES.includes(profile.role)) return null
  return user
}

// Mask an API key — show only last 6 chars
function maskKey(key: string): string {
  if (!key || key.length <= 6) return "••••••"
  return "••••••••••••" + key.slice(-6)
}

// Test a FaucetPay API key by calling the balance endpoint
async function testFaucetPayKey(apiKey: string): Promise<{
  valid: boolean
  balance?: number
  currency?: string
  error?: string
}> {
  try {
    const form = new URLSearchParams()
    form.append("api_key", apiKey)
    form.append("currency", "BTC")

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 10000)

    const res = await fetch(`${FAUCETPAY_API_URL}/balance`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: ctrl.signal,
    })
    clearTimeout(tid)

    const data = await res.json()

    if (data.status === 200) {
      return { valid: true, balance: data.balance, currency: data.currency }
    }
    const errorMap: Record<number, string> = {
      400: "Invalid request format",
      401: "Invalid API key",
      403: "API access disabled",
      405: "Rate limited — try again shortly",
    }
    return {
      valid: false,
      error: errorMap[data.status] || data.message || `FaucetPay error ${data.status}`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { valid: false, error: "Request timed out — check your network" }
    }
    return { valid: false, error: "Could not reach FaucetPay API" }
  }
}

// GET — return masked key + status
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createAdminClient()

  // Try DB first, then env var
  const { data: row } = await db
    .from("system_settings")
    .select("value, updated_at, updated_by")
    .eq("key", SETTINGS_KEY)
    .maybeSingle()  // returns null (not throws) when key not yet set

  const rawKey = (row?.value as string | null)?.trim()
    || process.env.FAUCETPAY_API_KEY?.trim()
    || null

  if (!rawKey) {
    return NextResponse.json({
      configured: false,
      source: null,
      maskedKey: null,
      updatedAt: null,
      fromEnv: false,
    })
  }

  return NextResponse.json({
    configured: true,
    source: row?.value ? "database" : "environment",
    maskedKey: maskKey(rawKey),
    updatedAt: row?.updated_at ?? null,
    fromEnv: !row?.value,
  })
}

// POST — save a new key (with optional test-only mode)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { apiKey, testOnly = false } = body as { apiKey?: string; testOnly?: boolean }

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 })
  }

  const trimmed = apiKey.trim()

  // Always test the key before saving
  const testResult = await testFaucetPayKey(trimmed)

  if (!testResult.valid) {
    return NextResponse.json({
      success: false,
      tested: true,
      valid: false,
      error: testResult.error ?? "API key validation failed",
    }, { status: 400 })
  }

  if (testOnly) {
    return NextResponse.json({
      success: true,
      tested: true,
      valid: true,
      balance: testResult.balance,
      currency: testResult.currency,
    })
  }

  // Save to system_settings
  const db = createAdminClient()
  const { error: saveError } = await db
    .from("system_settings")
    .upsert(
      {
        key: SETTINGS_KEY,
        value: trimmed,
        description: "FaucetPay API key for payouts",
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    )

  if (saveError) {
    log.error("Failed to save FaucetPay API key", { error: saveError })
    return NextResponse.json({ error: "Failed to save API key to database" }, { status: 500 })
  }

  // Clear the cached API key so the new one is used immediately
  clearFaucetPayApiKeyCache()

  log.info("FaucetPay API key updated by admin", { adminId: admin.id })

  return NextResponse.json({
    success: true,
    tested: true,
    valid: true,
    maskedKey: maskKey(trimmed),
    balance: testResult.balance,
    currency: testResult.currency,
  })
}

// DELETE — remove key from DB (falls back to env var if set)
export async function DELETE() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createAdminClient()
  const { error } = await db
    .from("system_settings")
    .delete()
    .eq("key", SETTINGS_KEY)

  if (error) {
    return NextResponse.json({ error: "Failed to remove API key" }, { status: 500 })
  }

  // Clear the cached API key so it falls back to env var immediately
  clearFaucetPayApiKeyCache()

  const hasEnvFallback = !!process.env.FAUCETPAY_API_KEY?.trim()
  log.info("FaucetPay API key removed from DB by admin", { adminId: admin.id })

  return NextResponse.json({
    success: true,
    fallbackActive: hasEnvFallback,
    message: hasEnvFallback
      ? "DB key removed. The environment variable FAUCETPAY_API_KEY is now active."
      : "API key removed. FaucetPay payouts are now disabled.",
  })
}
