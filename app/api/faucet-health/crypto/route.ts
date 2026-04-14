import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getFaucetPayClientAsync, isFaucetPayConfiguredAsync } from "@/lib/faucetpay/client"
import { logger } from "@/lib/logger"

export const revalidate = 60 // Cache for 60 seconds

interface CryptoHealth {
  symbol: string
  name: string
  icon: string
  healthPercentage: number
  status: "healthy" | "moderate" | "low" | "critical"
  balanceSatoshis: number
  dailyPayouts: number
  estimatedDaysLeft: number
  hasRealData?: boolean
}

// Crypto configuration with FaucetPay currency codes
const CRYPTO_CONFIG: Record<string, { name: string; thresholdBTC: number; fpCurrency: string }> = {
  BTC: { name: "Bitcoin", thresholdBTC: 0.01, fpCurrency: "btc" },
  LTC: { name: "Litecoin", thresholdBTC: 0.005, fpCurrency: "ltc" },
  DOGE: { name: "Dogecoin", thresholdBTC: 0.003, fpCurrency: "doge" },
  TRX: { name: "TRON", thresholdBTC: 0.002, fpCurrency: "trx" },
  SOL: { name: "Solana", thresholdBTC: 0.005, fpCurrency: "sol" },
  ETH: { name: "Ethereum", thresholdBTC: 0.008, fpCurrency: "eth" },
  BNB: { name: "BNB", thresholdBTC: 0.004, fpCurrency: "bnb" },
  USDT: { name: "Tether", thresholdBTC: 0.005, fpCurrency: "usdt" },
  BCH: { name: "Bitcoin Cash", thresholdBTC: 0.003, fpCurrency: "bch" },
  DASH: { name: "Dash", thresholdBTC: 0.002, fpCurrency: "dash" },
  DGB: { name: "DigiByte", thresholdBTC: 0.001, fpCurrency: "dgb" },
  FEY: { name: "Feyorra", thresholdBTC: 0.001, fpCurrency: "fey" },
  ZEC: { name: "Zcash", thresholdBTC: 0.002, fpCurrency: "zec" },
  MATIC: { name: "Polygon", thresholdBTC: 0.002, fpCurrency: "matic" },
}

function getStatus(percentage: number): "healthy" | "moderate" | "low" | "critical" {
  if (percentage >= 70) return "healthy"
  if (percentage >= 40) return "moderate"
  if (percentage >= 20) return "low"
  return "critical"
}

export async function GET() {
  try {
    const supabase = await createClient()
    let faucetPayBalances: Record<string, number> = {}
    let faucetPayConnected = false

    // Check if FaucetPay is configured (checks DB first, then env var)
    const fpConfigured = await isFaucetPayConfiguredAsync()

    if (fpConfigured) {
      try {
        // Fetch balances for all supported currencies in parallel
        // Each currency needs its own client instance
        const balancePromises = Object.entries(CRYPTO_CONFIG).map(async ([symbol, config]) => {
          try {
            // Get a client for this specific currency (async - checks DB first)
            const faucetPay = await getFaucetPayClientAsync(config.fpCurrency.toUpperCase())
            const response = await faucetPay.getBalance()
            if (response.status === 200 && response.balance !== undefined) {
              return { symbol, balance: response.balance }
            }
            return { symbol, balance: null }
          } catch (err) {
            logger.debug(`Failed to fetch ${symbol} balance`, { error: err })
            return { symbol, balance: null }
          }
        })

        const results = await Promise.allSettled(balancePromises)
        let successCount = 0

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.balance !== null) {
            faucetPayBalances[result.value.symbol] = result.value.balance
            successCount++
          }
        }

        faucetPayConnected = successCount > 0
        logger.info("FaucetPay balances fetched", { successCount, total: Object.keys(CRYPTO_CONFIG).length })
      } catch (error) {
        logger.warn("FaucetPay balance fetch failed, using database fallback", { error })
      }
    } else {
      logger.info("FaucetPay not configured, using database fallback")
    }

    // Fallback: Fetch from database if FaucetPay API failed or not configured
    if (!faucetPayConnected) {
      try {
        const { data: balances, error: balanceError } = await supabase
          .from("faucetpay_balances")
          .select("*")
          .maybeSingle()

        if (balances && !balanceError) {
          for (const symbol of Object.keys(CRYPTO_CONFIG)) {
            const key = `${symbol.toLowerCase()}_balance`
            if (balances[key] !== undefined && balances[key] !== null) {
              faucetPayBalances[symbol] = Number(balances[key])
            }
          }
          // If we got any balances from DB, consider it partially connected
          if (Object.keys(faucetPayBalances).length > 0) {
            faucetPayConnected = true
            logger.info("Using database-stored FaucetPay balances", { count: Object.keys(faucetPayBalances).length })
          }
        }
      } catch (dbError) {
        logger.warn("Failed to fetch balances from database", { error: dbError })
      }
    }

    // Fetch daily payout stats per crypto
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    const { data: dailyPayouts } = await supabase
      .from("claims")
      .select("currency, amount_satoshis")
      .gte("created_at", oneDayAgo.toISOString())

    // Aggregate daily payouts by currency
    const payoutsByCrypto: Record<string, number> = {}
    if (dailyPayouts) {
      dailyPayouts.forEach((claim: any) => {
        const currency = claim.currency || "BTC"
        payoutsByCrypto[currency] = (payoutsByCrypto[currency] || 0) + Number(claim.amount_satoshis || 0)
      })
    }

    // Build health data for each crypto
    const cryptos: CryptoHealth[] = []

    for (const [symbol, config] of Object.entries(CRYPTO_CONFIG)) {
      // Get balance from FaucetPay or database - NO fake data, use 0 if unknown
      const balanceSatoshis = faucetPayBalances[symbol] ?? 0
      const hasRealData = faucetPayBalances[symbol] !== undefined

      // Healthy threshold in satoshis (1 BTC = 100M satoshis)
      const healthyThreshold = config.thresholdBTC * 100000000

      // Calculate health percentage - show 0% if no real data
      const healthPercentage = hasRealData
        ? Math.min(100, Math.round((balanceSatoshis / healthyThreshold) * 100))
        : 0

      // Get daily payouts for this crypto from actual database data
      const dailyPayout = payoutsByCrypto[symbol] || 0

      // Estimate days left (only if we have real balance data)
      const estimatedDaysLeft = hasRealData && dailyPayout > 0
        ? Math.floor(balanceSatoshis / dailyPayout)
        : hasRealData ? 999 : 0

      cryptos.push({
        symbol,
        name: config.name,
        icon: symbol,
        healthPercentage,
        status: hasRealData ? getStatus(healthPercentage) : "critical",
        balanceSatoshis,
        dailyPayouts: dailyPayout,
        estimatedDaysLeft: Math.min(estimatedDaysLeft, 999),
        hasRealData, // New field to indicate if data is real
      })
    }

    // Sort by health (worst first to draw attention)
    cryptos.sort((a, b) => a.healthPercentage - b.healthPercentage)

    return NextResponse.json({
      cryptos,
      source: faucetPayConnected ? "faucetpay" : "database",
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error("Failed to fetch crypto health:", error instanceof Error ? error : new Error(String(error)))

    // Return empty data with error indicator on failure - NO fake data
    const emptyCryptos: CryptoHealth[] = Object.entries(CRYPTO_CONFIG).map(([symbol, config]) => ({
      symbol,
      name: config.name,
      icon: symbol,
      healthPercentage: 0,
      status: "critical" as const,
      balanceSatoshis: 0,
      dailyPayouts: 0,
      estimatedDaysLeft: 0,
      hasRealData: false,
    }))

    return NextResponse.json({
      cryptos: emptyCryptos,
      source: "error",
      error: "Failed to fetch balance data",
      timestamp: new Date().toISOString()
    })
  }
}
