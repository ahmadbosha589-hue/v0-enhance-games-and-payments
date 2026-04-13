import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getFaucetPayClient } from "@/lib/faucetpay/client"
import { logger } from "@/lib/logger"
import { logHoneypotProbeRequest } from "@/lib/security/honeypot-logger"

// These thresholds define the health tiers based on your faucet balance
const BALANCE_TIERS = {
  // Below this = CRITICAL (faucet may fail to pay users)
  CRITICAL: 10_000, // 0.0001 BTC = 10K sats
  // Below this = LOW (should top up soon)
  LOW: 50_000, // 0.0005 BTC = 50K sats
  // Below this = MODERATE (working but could use more)
  MODERATE: 100_000, // 0.001 BTC = 100K sats
  // At or above this = HEALTHY (optimal operation)
  HEALTHY: 200_000, // 0.002 BTC = 200K sats (this is 100% health)
}

export const revalidate = 30

export async function GET() {
  // Log control probe for fortress verification
  await logHoneypotProbeRequest("ctrl_faucet").catch(() => { })

  try {
    // Create admin client - returns null if not configured
    const supabase = createAdminClient()

    let faucetPayBalance = 0
    let faucetPayConnected = false
    let balanceInBTC = 0
    let faucetPayError: string | null = null

    try {
      const faucetPay = getFaucetPayClient()
      const balanceResponse = await faucetPay.getBalance()

      if (balanceResponse.status === 200) {
        faucetPayBalance = balanceResponse.balance || 0
        balanceInBTC = balanceResponse.balance_bitcoin || 0
        faucetPayConnected = true
      } else {
        faucetPayError = balanceResponse.message || "API returned non-200 status"
      }
    } catch (error) {
      faucetPayError = error instanceof Error ? error.message : "Connection failed"
      logger.warn("FaucetPay balance fetch failed", { errorMessage: faucetPayError })
    }

    // Get fraud stats in parallel (only if supabase is available)
    let fraudStats: { fraud_type: string; severity: number }[] | null = null
    let todayFraudStats: { id: string }[] | null = null
    let claimStats: { id: string }[] | null = null

    if (supabase) {
      const [fraudResult, todayFraudResult, claimResult] = await Promise.all([
        supabase.from("fraud_flags").select("fraud_type, severity", { count: "exact" }),
        supabase
          .from("fraud_flags")
          .select("id", { count: "exact" })
          .gte("created_at", new Date().toISOString().split("T")[0]),
        supabase.from("claims").select("id", { count: "exact" }).gte("fraud_score", 70),
      ])
      fraudStats = fraudResult.data
      todayFraudStats = todayFraudResult.data
      claimStats = claimResult.data
    }

    // This makes it clear: 100% = you have enough for healthy operation
    let healthPercentage = 0
    let healthStatus: "healthy" | "moderate" | "low" | "critical" | "unknown" = "unknown"

    if (faucetPayConnected) {
      // Calculate percentage relative to HEALTHY threshold (2M sats = 100%)
      healthPercentage = Math.min(100, Math.round((faucetPayBalance / BALANCE_TIERS.HEALTHY) * 100))

      // Determine status based on which tier the balance falls into
      if (faucetPayBalance >= BALANCE_TIERS.HEALTHY) {
        healthStatus = "healthy"
      } else if (faucetPayBalance >= BALANCE_TIERS.MODERATE) {
        healthStatus = "moderate"
      } else if (faucetPayBalance >= BALANCE_TIERS.LOW) {
        healthStatus = "low"
      } else {
        healthStatus = "critical"
      }
    }

    // Count fraud stats
    const totalBotsBlocked = fraudStats?.length || 0
    const botsBlockedToday = todayFraudStats?.length || 0
    const vpnProxyBlocked =
      fraudStats?.filter(
        (f) => f.fraud_type === "vpn_detected" || f.fraud_type === "proxy_detected" || f.fraud_type === "tor_detected",
      ).length || 0
    const adblockUsers = fraudStats?.filter((f) => f.fraud_type === "adblock_user").length || 0
    const suspiciousClaimsBlocked = claimStats?.length || 0

    return NextResponse.json({
      healthPercentage,
      healthStatus,

      // Raw balance data for display
      balanceSatoshis: faucetPayBalance,
      balanceBTC: balanceInBTC,
      faucetPayConnected,
      faucetPayError,

      // Anti-bot stats
      totalBotsBlocked,
      botsBlockedToday,
      vpnProxyBlocked,
      adblockUsers,
      suspiciousClaimsBlocked,
      totalFraudFlags: totalBotsBlocked,

      thresholds: {
        critical: BALANCE_TIERS.CRITICAL,
        low: BALANCE_TIERS.LOW,
        moderate: BALANCE_TIERS.MODERATE,
        healthy: BALANCE_TIERS.HEALTHY,
      },

      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error("Faucet health error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({
      healthPercentage: 0,
      healthStatus: "unknown",
      balanceSatoshis: 0,
      balanceBTC: 0,
      faucetPayConnected: false,
      faucetPayError: "Failed to fetch health data",
      totalBotsBlocked: 0,
      botsBlockedToday: 0,
      vpnProxyBlocked: 0,
      adblockUsers: 0,
      suspiciousClaimsBlocked: 0,
      totalFraudFlags: 0,
      thresholds: {
        critical: BALANCE_TIERS.CRITICAL,
        low: BALANCE_TIERS.LOW,
        moderate: BALANCE_TIERS.MODERATE,
        healthy: BALANCE_TIERS.HEALTHY,
      },
      timestamp: new Date().toISOString(),
    })
  }
}
