import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"

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

    return NextResponse.json({
      tiers: tiers || getDefaultTiers(),
      activeBooster,
      orderStatus,
      paymentMethods: {
        faucetpay: true,
        ccpayment: Boolean(process.env.CCPAYMENT_APP_ID && process.env.CCPAYMENT_APP_SECRET),
        cwallet: false,
        wallet_connect: false,
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

    switch (paymentMethod) {
      case "faucetpay": {
        // FaucetPay payment - requires user's satoshi balance
        const { data: profile } = await adminSupabase
          .from("profiles")
          .select("balance_satoshis")
          .eq("id", user.id)
          .single()

        const requiredSatoshis = tierData.price_satoshis
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
          "purchase_booster_with_balance",
          {
            p_user_id: user.id,
            p_booster_tier_id: tierData.id,
            p_payment_method: paymentMethod,
            p_payment_reference: orderId,
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
            message: `Complete your $${tierData.price_usd} payment via CCPayment. Booster activates automatically after blockchain confirmation.`,
            instructions: [
              "Click the payment link to open CCPayment checkout",
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

      case "cwallet": {
        // CWallet checkout is intentionally disabled until its callback
        // signature and activation webhook are implemented.
        const cwalletKey: string | null = null
        if (!cwalletKey) {
          return NextResponse.json({
            success: false,
            error: "Payment provider not configured",
            message: "CWallet is temporarily unavailable. Please use CCPayment, Direct Wallet Transfer, or Pay with Satoshis.",
          }, { status: 503 })
        }

        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)

        await adminSupabase.from("booster_purchases").insert({
          user_id: user.id,
          booster_tier_id: tierData.id,
          payment_method: paymentMethod,
          payment_status: "pending",
          payment_reference: orderId,
          amount_usd: tierData.price_usd,
          amount_satoshis: tierData.price_satoshis,
        })

        // CWallet hosted-checkout URL (uses public API key in URL)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
        const cwalletUrl = `https://cwallet.com/checkout?merchant=${encodeURIComponent(cwalletKey)}&order=${encodeURIComponent(orderId)}&amount=${tierData.price_usd}&currency=USD&callback=${encodeURIComponent(appUrl + "/api/webhooks/cwallet")}`

        return NextResponse.json({
          success: true,
          paymentCompleted: false,
          orderId,
          paymentMethod,
          paymentUrl: cwalletUrl,
          amountUsd: tierData.price_usd,
          expiresAt: expiresAt.toISOString(),
          message: `Complete your $${tierData.price_usd} payment via CWallet. Booster activates after confirmation.`,
          instructions: [
            "Click the payment link to open CWallet checkout",
            "Sign in or create a CWallet account",
            "Confirm the payment from your balance",
            "Your booster will be activated automatically",
          ],
        })
      }

      case "wallet_connect": {
        // Direct wallet checkout is disabled until a verified chain watcher
        // can match confirmations to the pending purchase.
        const btcAddress = ""

        if (!btcAddress) {
          return NextResponse.json({
            success: false,
            error: "Direct wallet transfer not configured",
            message:
              "The platform's BTC deposit address has not been configured yet. Please use Pay with Satoshis, CCPayment, or contact support.",
          }, { status: 503 })
        }

        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)

        await adminSupabase.from("booster_purchases").insert({
          user_id: user.id,
          booster_tier_id: tierData.id,
          payment_method: paymentMethod,
          payment_status: "pending",
          payment_reference: orderId,
          amount_usd: tierData.price_usd,
          amount_satoshis: tierData.price_satoshis,
        })

        // Use a live BTC price for accuracy; never issue a stale simulated quote.
        let btcPrice: number
        try {
          const { getBTCPrice } = await import("@/lib/ccpayment/client")
          btcPrice = await getBTCPrice()
        } catch (error) {
          console.error("Unable to fetch BTC price for booster checkout:", error)
          return NextResponse.json({
            error: "Live BTC pricing is temporarily unavailable. Please try again later.",
          }, { status: 503 })
        }
        const amountBtc = (tierData.price_usd / btcPrice).toFixed(8)

        return NextResponse.json({
          success: true,
          paymentCompleted: false,
          orderId,
          paymentMethod,
          paymentAddress: btcAddress,
          amountUsd: tierData.price_usd,
          amountBtc,
          expiresAt: expiresAt.toISOString(),
          message: `Send exactly ${amountBtc} BTC ($${tierData.price_usd}) to the address. Include the order ID in your reference if possible.`,
          instructions: [
            `Send exactly ${amountBtc} BTC to the address below`,
            "Use any BTC wallet (Trust, MetaMask BTC, Phantom, hardware wallets, exchanges)",
            `Reference / memo: ${orderId}`,
            "After 1-3 confirmations, your booster will be auto-activated",
            "Payment expires in 1 hour - keep this page open or note your order ID",
          ],
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
