import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { decimalToBaseUnits, getWalletPaymentConfig } from "@/lib/wallet/evm-payment"
import { usdToSatoshis } from "@/lib/pricing/crypto-rates"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (!supabase || !adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // Get all active booster tiers
    const { data: tiers, error: tiersError } = await adminSupabase
      .from("booster_tiers")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true })

    if (tiersError) {
      console.error("Error fetching booster tiers:", tiersError)
      // Return default tiers if table doesn't exist
      return NextResponse.json({
        tiers: getDefaultTiers(),
        activeBooster: null,
      })
    }

    // Live BTC pricing: the stored price_satoshis is a stale snapshot (5,000
    // sats was worth $5 when BTC was ~$100k; it drifts every day). Recompute
    // every tier's satoshi price from price_usd at the CURRENT BTC/USD rate.
    let pricingMeta: { btcUsd: number; rateFetchedAt: string } | null = null
    if (tiers && tiers.length > 0) {
      try {
        const first = await usdToSatoshis(Number(tiers[0].price_usd))
        pricingMeta = { btcUsd: first.btcUsd, rateFetchedAt: first.rateFetchedAt }
        tiers.forEach((t) => {
          t.price_satoshis = Math.floor((Number(t.price_usd) / first.btcUsd) * 100_000_000)
        })
      } catch (e) {
        console.error("Live BTC pricing unavailable:", e)
        // Refuse to serve stale prices rather than mischarging users.
        return NextResponse.json({
          error: "Pricing temporarily unavailable — live BTC rate could not be fetched",
          code: "RATE_UNAVAILABLE",
        }, { status: 503 })
      }
    }

    // Get user's active booster if logged in
    let activeBooster = null
    if (user) {
      const { data: userBooster } = await adminSupabase
        .from("user_boosters")
        .select(`
          id,
          started_at,
          expires_at,
          is_active,
          booster_tiers (
            id,
            name,
            slug,
            faucet_bonus_percentage,
            offerwall_bonus_percentage,
            badge_color,
            badge_icon
          )
        `)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .single()

      if (userBooster) {
        const tier = userBooster.booster_tiers as any
        const expiresAt = new Date(userBooster.expires_at)
        const now = new Date()
        const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))
        const daysRemaining = Math.max(0, Math.floor(hoursRemaining / 24))

        activeBooster = {
          id: userBooster.id,
          tier: tier?.name || "Unknown",
          slug: tier?.slug || "unknown",
          faucetBonus: tier?.faucet_bonus_percentage || 0,
          offerwallBonus: tier?.offerwall_bonus_percentage || 0,
          expiresAt: userBooster.expires_at,
          hoursRemaining,
          daysRemaining,
          badgeColor: tier?.badge_color || "#22c55e",
          badgeIcon: tier?.badge_icon || "zap",
        }
      }
    }

    let orderStatus: string | null = null
    if (user && orderId) {
      const { data: purchase } = await adminSupabase
        .from("booster_purchases")
        .select("payment_status")
        .eq("user_id", user.id)
        .eq("payment_reference", orderId)
        .maybeSingle()
      orderStatus = purchase?.payment_status ?? null
    }

    const ccpaymentEnabled = Boolean(process.env.CCPAYMENT_APP_ID && process.env.CCPAYMENT_APP_SECRET)
    const walletPaymentEnabled = Boolean(getWalletPaymentConfig())

    return NextResponse.json({
      tiers: tiers || getDefaultTiers(),
      activeBooster,
      orderStatus,
      pricing: pricingMeta,
      paymentMethods: {
        faucetpay: true,
        ccpayment: ccpaymentEnabled,
        cwallet: ccpaymentEnabled,
        wallet_connect: walletPaymentEnabled,
      },
    })
  } catch (error) {
    console.error("Boosters API error:", error)
    return NextResponse.json({
      error: "Internal server error",
      tiers: getDefaultTiers(),
      activeBooster: null
    }, { status: 500 })
  }
}

function getDefaultTiers() {
  return [
    {
      id: "basic",
      name: "Basic",
      slug: "basic",
      description: "Perfect for getting started. Boost your earnings with a solid bonus on all activities.",
      price_usd: 5.00,
      price_satoshis: 5000,
      faucet_bonus_percentage: 100,
      offerwall_bonus_percentage: 10,
      duration_days: 7,
      badge_color: "#22c55e",
      badge_icon: "zap",
      priority: 1,
      features: ["100% faucet claim bonus", "10% offerwall bonus", "7 days duration", "Basic badge"],
    },
    {
      id: "pro",
      name: "Pro",
      slug: "pro",
      description: "Step up your game with enhanced bonuses and longer duration.",
      price_usd: 10.00,
      price_satoshis: 10000,
      faucet_bonus_percentage: 200,
      offerwall_bonus_percentage: 20,
      duration_days: 15,
      badge_color: "#3b82f6",
      badge_icon: "flame",
      priority: 2,
      features: ["200% faucet claim bonus", "20% offerwall bonus", "15 days duration", "Pro badge", "Priority support"],
    },
    {
      id: "elite",
      name: "Elite",
      slug: "elite",
      description: "For serious earners. Maximum bonuses to supercharge your income.",
      price_usd: 20.00,
      price_satoshis: 20000,
      faucet_bonus_percentage: 300,
      offerwall_bonus_percentage: 35,
      duration_days: 30,
      badge_color: "#a855f7",
      badge_icon: "crown",
      priority: 3,
      features: ["300% faucet claim bonus", "35% offerwall bonus", "30 days duration", "Elite badge", "Priority support", "Early access to features"],
    },
    {
      id: "legend",
      name: "Legend",
      slug: "legend",
      description: "The ultimate package. Legendary bonuses for legendary earners.",
      price_usd: 50.00,
      price_satoshis: 50000,
      faucet_bonus_percentage: 500,
      offerwall_bonus_percentage: 50,
      duration_days: 30,
      badge_color: "#f59e0b",
      badge_icon: "star",
      priority: 4,
      features: ["500% faucet claim bonus", "50% offerwall bonus", "30 days duration", "Legend badge", "VIP support", "Early access to features", "Exclusive tournaments"],
    },
  ]
}

// POST - Initiate a booster purchase (creates pending order, does NOT activate booster)
// Booster is only activated when payment is verified via webhook
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()

    if (!supabase || !adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { tierId, paymentMethod } = body

    if (!tierId || !paymentMethod) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get the booster tier
    const { data: tier, error: tierError } = await adminSupabase
      .from("booster_tiers")
      .select("*")
      .eq("id", tierId)
      .eq("is_active", true)
      .single()

    if (tierError || !tier) {
      console.error("Booster tier lookup failed:", tierError)
      return NextResponse.json({
        error: "Booster catalog is temporarily unavailable",
        message: "Please try again when the live booster catalog is available.",
      }, { status: 503 })
    }

    const tierData = tier

    const orderId = `booster_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Live-rate satoshi price, shared by the balance and merchant paths.
    let requiredLiveSats: number | null = null
    try {
      requiredLiveSats = (await usdToSatoshis(Number(tierData.price_usd))).satoshis
    } catch {
      requiredLiveSats = null // merchant path can still proceed (USD-priced); balance path re-fetches
    }

    switch (paymentMethod) {
      case "faucetpay": {
        // FaucetPay payment - requires user's satoshi balance.
        // The charge is computed at the LIVE BTC/USD rate at purchase time —
        // the stored price_satoshis is only a cached display hint.
        let liveRate: number
        try {
          liveRate = (await usdToSatoshis(tierData.price_usd)).btcUsd
        } catch {
          return NextResponse.json({
            error: "Pricing temporarily unavailable — live BTC rate could not be fetched",
            code: "RATE_UNAVAILABLE",
          }, { status: 503 })
        }
        const requiredSatoshis = Math.floor((Number(tierData.price_usd) / liveRate) * 100_000_000)

        const { data: profile } = await adminSupabase
          .from("profiles")
          .select("balance_satoshis")
          .eq("id", user.id)
          .single()
        const currentBalance = Number(profile?.balance_satoshis || 0)

        if (currentBalance < requiredSatoshis) {
          return NextResponse.json({
            error: "Insufficient balance",
            required: requiredSatoshis,
            available: currentBalance,
            message: `You need ${requiredSatoshis.toLocaleString()} satoshis but only have ${currentBalance.toLocaleString()}`
          }, { status: 400 })
        }

        // Reserve the balance, create the completed purchase, and activate the
        // booster in one locked database transaction. The old read/update/insert
        // sequence could double-spend under concurrent requests.
        const { data: purchaseResult, error: purchaseError } = await adminSupabase.rpc(
          "purchase_booster_with_balance_at_price",
          {
            p_user_id: user.id,
            p_booster_tier_id: tierData.id,
            p_payment_method: paymentMethod,
            p_payment_reference: orderId,
            p_price_satoshis: requiredSatoshis,
          },
        )

        if (purchaseError || !purchaseResult?.success) {
          const message = purchaseError?.message || "Unable to complete booster purchase"
          const insufficient = /insufficient balance/i.test(message)
          return NextResponse.json({
            error: insufficient ? "Insufficient balance" : "Booster purchase unavailable",
            message,
          }, { status: insufficient ? 400 : 503 })
        }

        return NextResponse.json({
          success: true,
          paymentCompleted: true,
          booster: {
            tier: purchaseResult.tier_name || tierData.name,
            expiresAt: purchaseResult.expires_at,
            faucetBonus: purchaseResult.faucet_bonus_percentage ?? tierData.faucet_bonus_percentage,
            offerwallBonus: purchaseResult.offerwall_bonus_percentage ?? tierData.offerwall_bonus_percentage,
          },
          newBalance: purchaseResult.new_balance,
          message: `${tierData.name} Booster activated! ${requiredSatoshis.toLocaleString()} satoshis deducted.`,
        })
      }

      case "cwallet":
      case "ccpayment": {
        // Real CCPayment integration - create hosted checkout URL
        const ccAppId = process.env.CCPAYMENT_APP_ID
        const ccAppSecret = process.env.CCPAYMENT_APP_SECRET

        if (!ccAppId || !ccAppSecret) {
          return NextResponse.json({
            success: false,
            error: "Payment provider not configured",
            message: "Crypto payments are temporarily unavailable. Please contact support or use Pay with Satoshis.",
          }, { status: 503 })
        }

        const paymentProviderLabel = paymentMethod === "cwallet" ? "CWallet through CCPayment hosted checkout" : "CCPayment"
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)

        try {
          const { getCCPaymentClient } = await import("@/lib/ccpayment/client")
          const cc = getCCPaymentClient()
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
          const order = await cc.createOrder({
            productPrice: tierData.price_usd.toFixed(2),
            currency: "USD",
            merchantOrderId: orderId,
            denominated: "USDT",
            notifyUrl: appUrl ? `${appUrl}/api/ccpayment/webhook` : undefined,
            returnUrl: appUrl ? `${appUrl}/dashboard/boosters?order=${orderId}` : undefined,
            productName: `${tierData.name} Booster (${tierData.duration_days} days)`,
            orderValidPeriod: 3600,
            customValue: JSON.stringify({ userId: user.id, tierId: tierData.id, kind: "booster" }),
          })

          await adminSupabase.from("booster_purchases").insert({
            user_id: user.id,
            booster_tier_id: tierData.id,
            payment_method: paymentMethod,
            payment_status: "pending",
            payment_reference: orderId,
            amount_usd: tierData.price_usd,
            amount_satoshis: tierData.price_satoshis,
          })

          return NextResponse.json({
            success: true,
            paymentCompleted: false,
            orderId,
            paymentMethod,
            paymentUrl: order.paymentUrl || order.invoiceUrl || order.checkoutUrl,
            paymentAddress: order.payAddress,
            amountUsd: tierData.price_usd,
            expiresAt: expiresAt.toISOString(),
            message: `Complete your $${tierData.price_usd} payment via ${paymentProviderLabel}. Booster activates automatically after blockchain confirmation.`,
            instructions: [
              "Open the CCPayment hosted checkout (CWallet users can pay from their Cwallet wallet)",
              "Choose your preferred cryptocurrency (BTC, ETH, USDT, and 50+ more)",
              "Send the exact amount shown",
              "Your booster will be activated automatically once confirmed",
            ],
          })
        } catch (ccErr: any) {
          console.error("CCPayment order creation failed:", ccErr)
          return NextResponse.json({
            success: false,
            error: "Payment provider error",
            message: ccErr?.message || "Could not create payment order. Please try again later.",
          }, { status: 502 })
        }
      }

      case "wallet_connect": {
        const walletConfig = getWalletPaymentConfig()
        if (!walletConfig) {
          return NextResponse.json({
            success: false,
            error: "Direct wallet transfer not configured",
            message: "The buyer must configure the EVM chain, ERC-20 token, destination wallet, RPC endpoint, token rate, and confirmation count.",
          }, { status: 503 })
        }

        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)
        const amountToken = (tierData.price_usd / Number(walletConfig.tokenUsdRate)).toFixed(walletConfig.tokenDecimals)
        const amountBaseUnits = decimalToBaseUnits(amountToken, walletConfig.tokenDecimals)

        const { error: purchaseInsertError } = await adminSupabase.from("booster_purchases").insert({
          user_id: user.id,
          booster_tier_id: tierData.id,
          payment_method: paymentMethod,
          payment_status: "pending",
          payment_reference: orderId,
          amount_usd: tierData.price_usd,
          amount_satoshis: tierData.price_satoshis,
        })
        if (purchaseInsertError) throw purchaseInsertError

        return NextResponse.json({
          success: true,
          paymentCompleted: false,
          orderId,
          paymentMethod,
          amountUsd: tierData.price_usd,
          expiresAt: expiresAt.toISOString(),
          walletPayment: {
            chainId: walletConfig.chainId,
            chainName: walletConfig.chainName,
            tokenAddress: walletConfig.tokenAddress,
            destinationAddress: walletConfig.destinationAddress,
            tokenSymbol: walletConfig.tokenSymbol,
            tokenDecimals: walletConfig.tokenDecimals,
            amountToken,
            amountBaseUnits,
            confirmations: walletConfig.confirmations,
            rpcUrl: walletConfig.rpcUrl,
          },
          message: `Connect your wallet and send ${amountToken} ${walletConfig.tokenSymbol}. The booster activates after ${walletConfig.confirmations} confirmations.`,
          instructions: [
            `Connect a wallet on ${walletConfig.chainName}`,
            `Approve the ERC-20 ${walletConfig.tokenSymbol} transfer to the configured destination`,
            `Send exactly ${amountToken} ${walletConfig.tokenSymbol}`,
            `Wait for ${walletConfig.confirmations} blockchain confirmations`,
          ],
        })
      }

      case "faucetpay_merchant": {
        // FaucetPay Merchant checkout: user pays from their FaucetPay wallet
        // (or any crypto address). The existing IPN callback
        // (/api/deposit/faucetpay/callback) verifies the payment
        // server-to-server; a booster-kind session activates the tier.
        const merchantUsername = process.env.FAUCETPAY_MERCHANT_USERNAME?.trim()
        if (!merchantUsername) {
          return NextResponse.json({
            success: false,
            error: "FaucetPay payments are not enabled yet",
            code: "FAUCETPAY_MERCHANT_DISABLED",
          }, { status: 503 })
        }

        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)

        // Record the pending purchase first (webhook activates it).
        const { error: purchaseInsertError } = await adminSupabase.from("booster_purchases").insert({
          user_id: user.id,
          booster_tier_id: tierData.id,
          payment_method: "faucetpay_merchant",
          payment_status: "pending",
          payment_reference: orderId,
          amount_usd: tierData.price_usd,
          amount_satoshis: requiredLiveSats ?? tierData.price_satoshis,
        })
        if (purchaseInsertError) throw purchaseInsertError

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
        const { createHmac, randomBytes } = await import("node:crypto")
        const secret =
          process.env.FAUCETPAY_IPN_SECRET?.trim() || process.env.FAUCETPAY_API_KEY?.trim() || ""
        const payload = Buffer.from(
          JSON.stringify({
            kind: "booster",
            userId: user.id,
            tierId: tierData.id,
            orderId,
            nonce: randomBytes(8).toString("hex"),
            createdAt: Date.now(),
          }),
        ).toString("base64url")
        const sig = secret ? createHmac("sha256", secret).update(payload).digest("base64url") : ""
        const custom = `${payload}.${sig}`

        const params = new URLSearchParams({
          merchant_username: merchantUsername,
          item_description: `${tierData.name} Booster (${tierData.duration_days} days)`,
          amount1: Number(tierData.price_usd).toFixed(2),
          currency1: "USD",
          callback_url: `${baseUrl}/api/deposit/faucetpay/callback`,
          success_url: `${baseUrl}/dashboard/boosters?order=${orderId}`,
          cancel_url: `${baseUrl}/dashboard/boosters?order=${orderId}&cancelled=1`,
          custom,
        })

        return NextResponse.json({
          success: true,
          paymentCompleted: false,
          orderId,
          paymentMethod,
          paymentUrl: `https://faucetpay.io/merchant/webscr?${params.toString()}`,
          amountUsd: tierData.price_usd,
          expiresAt: expiresAt.toISOString(),
          message: "You will be redirected to FaucetPay to complete the payment. Your booster activates automatically after confirmation.",
        })
      }

      default:
        return NextResponse.json({ error: "Invalid payment method" }, { status: 400 })
    }
  } catch (error) {
    console.error("Booster purchase error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
