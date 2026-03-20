import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { withdrawalRequestSchema } from "@/lib/api/validators"
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limiter"
import { WITHDRAWAL_CONFIG, FRAUD_CONFIG } from "@/lib/constants/config"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const headersList = await headers()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : headersList.get("x-real-ip") || "127.0.0.1"

    // Rate limiting
    const rateLimitResult = checkRateLimit(`withdrawal:${user.id}`, RATE_LIMITS.withdrawal)
    if (!rateLimitResult.allowed) {
      log.warn("Withdrawal rate limited", { userId: user.id })
      return NextResponse.json(
        { error: "Too many withdrawal requests", retryAfter: rateLimitResult.retryAfter },
        { status: 429 },
      )
    }

    const body = await request.json()
    const validatedData = withdrawalRequestSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
    }

    const { amount } = validatedData.data

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      log.error("Profile fetch failed in withdrawal", { error: profileError, userId: user.id })
      return NextResponse.json({ error: "Unable to load profile. Please refresh and try again." }, { status: 503 })
    }

    // Security checks
    if (profile.status === "banned" || profile.banned_at) {
      log.warn("Banned user attempted withdrawal", { userId: user.id })
      return NextResponse.json({ error: "Account is suspended" }, { status: 403 })
    }

    // Only block if high fraud score AND flagged (both conditions)
    // This prevents false positives from temporary score spikes
    if (profile.is_flagged && profile.fraud_score >= FRAUD_CONFIG.withdrawalBlockScore) {
      log.warn("Flagged user attempted withdrawal", { userId: user.id, fraudScore: profile.fraud_score })
      return NextResponse.json(
        {
          error:
            "Account under review. Withdrawals are temporarily disabled. Please contact support if you believe this is an error.",
          code: "FRAUD_REVIEW_PENDING",
        },
        { status: 403 },
      )
    }

    const requiresManualReview = profile.fraud_score >= FRAUD_CONFIG.manualReviewScore

    // Robust FaucetPay email lookup — same triple-fallback as direct faucet
    let faucetPayEmail: string | null = (profile.faucetpay_email || "").trim() || null

    // Fallback 1: fresh DB re-fetch (handles stale profile cache)
    if (!faucetPayEmail) {
      try {
        const { data: fp } = await adminSupabase
          .from("profiles")
          .select("faucetpay_email")
          .eq("id", user.id)
          .single()
        faucetPayEmail = (fp?.faucetpay_email || "").trim() || null
        if (faucetPayEmail) log.info("FaucetPay email found on withdrawal re-fetch", { userId: user.id })
      } catch { /* continue */ }
    }

    if (!faucetPayEmail) {
      log.warn("Withdrawal attempted without FaucetPay email", {
        userId: user.id,
        rawValue: profile.faucetpay_email,
        verified: profile.faucetpay_verified
      })
      return NextResponse.json({
        error: "FaucetPay email not configured. Go to Settings → Payment Settings and save your FaucetPay email.",
        code: "FAUCETPAY_NOT_CONFIGURED",
        action: "settings",
        detail: "If you already saved it, try removing and re-entering your email in Account Settings."
      }, { status: 400 })
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(faucetPayEmail)) {
      log.warn("Invalid FaucetPay email format", {
        userId: user.id,
        email: faucetPayEmail
      })
      return NextResponse.json({
        error: "Invalid FaucetPay email format. Please update your email in Settings.",
        code: "INVALID_FAUCETPAY_EMAIL",
        action: "settings"
      }, { status: 400 })
    }

    // Log the FaucetPay email being used for debugging
    log.info("Withdrawal using FaucetPay email", {
      userId: user.id,
      email: faucetPayEmail.substring(0, 5) + "***",
      verified: profile.faucetpay_verified
    })

    // Validate amount
    if (amount < WITHDRAWAL_CONFIG.minimumSatoshis) {
      return NextResponse.json(
        { error: `Minimum withdrawal is ${WITHDRAWAL_CONFIG.minimumSatoshis} satoshis` },
        { status: 400 },
      )
    }

    if (amount > WITHDRAWAL_CONFIG.maximumSatoshis) {
      return NextResponse.json(
        { error: `Maximum withdrawal is ${WITHDRAWAL_CONFIG.maximumSatoshis} satoshis` },
        { status: 400 },
      )
    }

    if (Number(profile.balance_satoshis) < amount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    // Check daily withdrawal limit
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: todayWithdrawals } = await supabase
      .from("withdrawals")
      .select("amount_satoshis")
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString())
      .in("status", ["pending", "processing", "completed"])

    const todayTotal = todayWithdrawals?.reduce((sum, w) => sum + Number(w.amount_satoshis), 0) || 0

    if (todayTotal + amount > WITHDRAWAL_CONFIG.dailyLimitSatoshis) {
      return NextResponse.json(
        {
          error: `Daily withdrawal limit exceeded. Remaining: ${WITHDRAWAL_CONFIG.dailyLimitSatoshis - todayTotal} satoshis`,
        },
        { status: 400 },
      )
    }

    // Check for pending withdrawals
    const { count: pendingCount } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])

    if (pendingCount && pendingCount >= 3) {
      return NextResponse.json(
        { error: "You have too many pending withdrawals. Please wait for them to process." },
        { status: 400 },
      )
    }

    // Calculate fee
    const fee = Math.ceil((amount * WITHDRAWAL_CONFIG.feePercentage) / 100)
    const netAmount = amount - fee

    // Generate idempotency key
    const idempotencyKey = uuidv4()

    // Create withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert({
        user_id: user.id,
        amount_satoshis: amount,
        fee_satoshis: fee,
        net_amount_satoshis: netAmount,
        payment_method: "faucetpay",
        payment_address: profile.faucetpay_email,
        payment_currency: "BTC",
        status: requiresManualReview ? "review" : "pending",
        fraud_score: profile.fraud_score,
        is_flagged: profile.is_flagged,
        idempotency_key: idempotencyKey,
        metadata: requiresManualReview ? { review_reason: "Fraud score above threshold" } : undefined,
      })
      .select()
      .single()

    if (withdrawalError) {
      log.error("Withdrawal insert error", { error: withdrawalError, userId: user.id })
      return NextResponse.json({ error: "Failed to create withdrawal" }, { status: 500 })
    }

    // Deduct from balance
    const newBalance = Number(profile.balance_satoshis) - amount
    const newTotalWithdrawn = Number(profile.total_withdrawn_satoshis) + amount

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_withdrawn_satoshis: newTotalWithdrawn,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      // Rollback withdrawal
      await supabase.from("withdrawals").delete().eq("id", withdrawal.id)
      log.error("Balance update error", { error: updateError, userId: user.id })
      return NextResponse.json({ error: "Failed to process withdrawal" }, { status: 500 })
    }

    // Create transaction record
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "withdrawal",
      status: "pending",
      amount_satoshis: -amount,
      balance_before: profile.balance_satoshis,
      balance_after: newBalance,
      withdrawal_id: withdrawal.id,
      description: `Withdrawal to FaucetPay`,
      metadata: { fee, net_amount: netAmount, faucetpay_email: profile.faucetpay_email },
      idempotency_key: `tx_${idempotencyKey}`,
    })

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: profile.role,
      actor_ip: ipAddress,
      action: "withdrawal_requested",
      resource_type: "withdrawal",
      resource_id: withdrawal.id,
      metadata: {
        amount,
        fee,
        net_amount: netAmount,
        faucetpay_email: profile.faucetpay_email,
      },
    })

    // Create notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "withdrawal_pending",
      title: "Withdrawal Requested",
      message: `Your withdrawal of ${amount} satoshis is being processed. You'll receive ${netAmount} satoshis.`,
      data: { withdrawal_id: withdrawal.id },
    })

    log.info("Withdrawal requested", {
      userId: user.id,
      withdrawalId: withdrawal.id,
      amount,
      netAmount,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amount,
        fee,
        netAmount,
        status: "pending",
      },
      balance: newBalance,
    })
  } catch (error) {
    log.error("Withdrawal error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // If stats requested, return withdrawal statistics
    if (searchParams.get("stats") === "true") {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: todayWithdrawals } = await supabase
        .from("withdrawals")
        .select("amount_satoshis")
        .eq("user_id", user.id)
        .gte("created_at", todayStart.toISOString())
        .in("status", ["pending", "processing", "completed"])

      const { count: pendingCount } = await supabase
        .from("withdrawals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["pending", "processing"])

      const dailyUsed = todayWithdrawals?.reduce((sum, w) => sum + Number(w.amount_satoshis), 0) || 0

      return NextResponse.json({
        dailyUsed,
        dailyLimit: WITHDRAWAL_CONFIG.dailyLimitSatoshis,
        pendingCount: pendingCount || 0,
      })
    }

    // Otherwise return withdrawal history
    const limit = Math.min(Number(searchParams.get("limit")) || 10, 50)
    const offset = Number(searchParams.get("offset")) || 0
    const status = searchParams.get("status")

    let query = supabase
      .from("withdrawals")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq("status", status)
    }

    const { data: withdrawals, error, count } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 })
    }

    return NextResponse.json({
      withdrawals,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    })
  } catch (error) {
    log.error("Get withdrawals error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
