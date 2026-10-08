import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { isValidCouponCodeFormat } from "@/lib/utils/secure-coupon-generator"
import { checkRateLimit } from "@/lib/api/rate-limiter"

const MAX_REDEMPTIONS_PER_DAY = 10
const MIN_CODE_LENGTH = 6
const MAX_CODE_LENGTH = 20

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

    // SECURITY: fail-closed rate limit BEFORE any redemption logic. Coupon
    // redemption mints satoshis — unlimited brute force of 12-char codes is
    // the exact attack this blocks. Denies when Redis is unconfigured.
    const rl = await checkRateLimit(`coupon:${user.id}:${ip}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    })
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many redemption attempts — try again shortly" }, { status: 429 })
    }

    // Bot detection
    if (userAgent.toLowerCase().includes("bot") ||
      userAgent.toLowerCase().includes("crawler")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await req.json()
    const { code, fingerprint } = body

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 })
    }

    if (!fingerprint || typeof fingerprint !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      console.error("[coupons/redeem] Admin client not available")
      return NextResponse.json({ error: "Coupon rewards are temporarily unavailable" }, { status: 503 })
    }

    const { data: result, error: redemptionError } = await adminSupabase!.rpc("redeem_coupon_atomic", {
      p_user_id: user!.id,
      p_code: code,
      p_ip_address: ip,
      p_user_agent: userAgent,
    })

    if (redemptionError) {
      console.error("Coupon atomic redemption failed:", redemptionError)
      return NextResponse.json({ error: "Coupon service is temporarily unavailable" }, { status: 503 })
    }
    if (!result?.success) {
      const status = result?.error === "DAILY_LIMIT" ? 429 : result?.error === "ALREADY_REDEEMED" ? 400 : 400
      return NextResponse.json({ error: result?.message || "Coupon redemption failed" }, { status })
    }

    return NextResponse.json({
      success: true,
      reward: result.reward,
      couponName: result.coupon_name,
      newBalance: result.new_balance,
      message: `Successfully redeemed ${result.reward} satoshis!`,
    })

    /* istanbul ignore next -- legacy non-atomic implementation retained for rollback reference */
    if (false) {
    const normalizedCode = code.trim().toUpperCase()

    // Validate code length and format
    if (normalizedCode.length < MIN_CODE_LENGTH || normalizedCode.length > MAX_CODE_LENGTH) {
      return NextResponse.json({ error: "Invalid coupon code format" }, { status: 400 })
    }

    // For 12-character codes, validate secure format
    if (normalizedCode.length === 12 && !isValidCouponCodeFormat(normalizedCode)) {
      return NextResponse.json({ error: "Invalid coupon code format" }, { status: 400 })
    }

    // Rate limiting: Check attempts from this IP in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentAttempts } = await adminSupabase!
      .from("coupon_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("redeemed_at", oneHourAgo)

    if ((recentAttempts ?? 0) >= 50) {
      return NextResponse.json({
        error: "Too many attempts. Please try again later.",
      }, { status: 429 })
    }

    // Check daily redemption limit
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count: todayCount } = await adminSupabase!
      .from("coupon_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .gte("redeemed_at", today.toISOString())

    if ((todayCount ?? 0) >= MAX_REDEMPTIONS_PER_DAY) {
      return NextResponse.json({
        error: "Daily redemption limit reached",
        maxRedemptions: MAX_REDEMPTIONS_PER_DAY
      }, { status: 429 })
    }

    // Find the coupon
    const { data: coupon, error: couponError } = await adminSupabase!
      .from("coupons")
      .select("*")
      .eq("code", normalizedCode)
      .eq("is_active", true)
      .single()

    if (couponError || !coupon) {
      return NextResponse.json({ error: "Invalid or expired coupon code" }, { status: 404 })
    }

    // Check if coupon has expired
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: "This coupon has expired" }, { status: 400 })
    }

    // Check if coupon has reached max uses
    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return NextResponse.json({ error: "This coupon has reached its maximum uses" }, { status: 400 })
    }

    // Check if user already redeemed this coupon
    const { data: existingRedemption } = await adminSupabase!
      .from("coupon_redemptions")
      .select("id")
      .eq("user_id", user!.id)
      .eq("coupon_id", coupon.id)
      .single()

    if (existingRedemption) {
      return NextResponse.json({ error: "You have already redeemed this coupon" }, { status: 400 })
    }

    // Redeem the coupon
    const { error: redemptionError } = await adminSupabase!
      .from("coupon_redemptions")
      .insert({
        user_id: user!.id,
        coupon_id: coupon.id,
        reward_satoshis: coupon.reward_satoshis,
        ip_address: ip,
        user_agent: userAgent
      })

    if (redemptionError) {
      console.error("Error redeeming coupon:", redemptionError)
      return NextResponse.json({ error: "Failed to redeem coupon" }, { status: 500 })
    }

    // Update coupon usage count
    await adminSupabase!
      .from("coupons")
      .update({ current_uses: (coupon.current_uses || 0) + 1 })
      .eq("id", coupon.id)

    // Award satoshis to user
    await adminSupabase!.rpc("add_game_reward", {
      p_user_id: user!.id,
      p_amount: coupon.reward_satoshis
    })

    return NextResponse.json({
      success: true,
      reward: coupon.reward_satoshis,
      couponName: coupon.code,
      message: `Successfully redeemed ${coupon.reward_satoshis} satoshis!`
    })
    }
  } catch (error) {
    console.error("Coupon redeem error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
