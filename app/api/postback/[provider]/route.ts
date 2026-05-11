import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac, createHash } from "crypto"

interface PostbackParams {
  userId: string
  offerId: string
  offerName?: string
  credits: number
  transactionId: string
  ip?: string
  userAgent?: string
}

const PROVIDER_SECRETS: Record<string, string> = {
  ccxua: process.env.CCXUA_SECRET_KEY || "",
  "cpx-research": process.env.CPX_SECRET_KEY || "",
  torox: process.env.TOROX_SECRET_KEY || "",
  lootably: process.env.LOOTABLY_SECRET_KEY || "",
  adgate: process.env.ADGATE_SECRET_KEY || "",
  "mm-wall": process.env.MM_WALL_SECRET_KEY || "",
  timewall: process.env.TIMEWALL_SECRET_KEY || "",
  "offerwall-me": process.env.OFFERWALLME_SECRET_KEY || "",
  bicotasks: process.env.BICOTASKS_SECRET_KEY || "",
  adscend: process.env.ADSCEND_SECRET_KEY || "",
  bitlabs: process.env.BITLABS_SECRET_KEY || "",
  "ayet-studios": process.env.AYET_STUDIOS_SECRET_KEY || "",
  "hang-my-ads": process.env.HANG_MY_ADS_SECRET_KEY || "",
  notik: process.env.NOTIK_SECRET_KEY || "",
}

// c.cx.ua sends postbacks from these IPs (see https://c.cx.ua/docs/ → "IPs to whitelist").
// Whitelist enforcement is disabled when the env var is unset so testing isn't blocked.
const CCXUA_DEFAULT_IPS = [
  "37.27.143.21",
  "2a01:4f9:3100:1721::1",
  "2a01:4f9:3100:1721:0:0:0:1",
]

const PROVIDER_IP_WHITELIST: Record<string, string[]> = {
  ccxua: process.env.CCXUA_ENFORCE_IP_WHITELIST === "true" ? CCXUA_DEFAULT_IPS : [],
  "cpx-research": [],
  torox: [],
  lootably: [],
  adgate: [],
  "mm-wall": [],
  timewall: [],
  "offerwall-me": [],
  bicotasks: [],
  adscend: [],
  bitlabs: [],
  "ayet-studios": [],
  "hang-my-ads": [],
  notik: [],
}

// Providers that expect a specific plain-text response body
const PROVIDER_OK_RESPONSE: Record<string, string> = {
  ccxua: "ok",
}

const PROVIDER_DUPLICATE_RESPONSE: Record<string, string> = {
  ccxua: "DUP",
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function validateSignature(provider: string, params: Record<string, string>, signature: string): boolean {
  const secret = PROVIDER_SECRETS[provider]

  // If no secret is configured, skip validation (but log warning)
  if (!secret) {
    console.warn(`[Postback] No secret configured for provider: ${provider}`)
    // In production, you might want to reject requests without configured secrets
    return process.env.NODE_ENV === "development"
  }

  try {
    switch (provider) {
      case "ccxua": {
        // c.cx.ua uses MD5: md5(subId + transId + reward + secret)
        const expectedSig = createHash("md5")
          .update(`${params.subId}${params.transId}${params.reward}${secret}`)
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "cpx-research": {
        // CPX Research uses MD5: md5(transId-usrId-amountUSD-secretKey)
        const expectedSig = createHash("md5")
          .update(
            `${params.trans_id || params.transaction_id}-${params.user_id || params.ext_user_id}-${params.amount_usd}-${secret}`,
          )
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "torox": {
        // Torox uses HMAC-SHA256 of sorted params
        const sortedParams = Object.keys(params)
          .filter((k) => k !== "sig" && k !== "signature")
          .sort()
          .map((k) => `${k}=${params[k]}`)
          .join("&")
        const expectedSig = createHmac("sha256", secret).update(sortedParams).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "lootably": {
        // Lootably uses SHA1: sha1(transactionId + secret)
        const expectedSig = createHash("sha1").update(`${params.transactionId}${secret}`).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "adgate": {
        // AdGate uses MD5: md5(transaction_id + secret)
        const expectedSig = createHash("md5").update(`${params.transaction_id}${secret}`).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "mm-wall": {
        // MM Wall uses SHA256: sha256(user_id + offer_id + reward + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id || params.subid}${params.offer_id}${params.reward}${secret}`)
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "timewall": {
        // Timewall uses HMAC-SHA256
        const dataStr = `${params.user_id}${params.amount}${params.transaction_id}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }


      case "offerwall-me": {
        // Offerwall.me uses HMAC-SHA256: hmac_sha256(user_id + transaction_id, secret)
        const dataStr = `${params.user_id}${params.transaction_id}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "bicotasks": {
        // Bicotasks uses SHA256: sha256(user_id + offer_id + amount + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id}${params.offer_id}${params.amount}${secret}`)
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "adscend": {
        // Adscend uses SHA256 HMAC
        const dataStr = `${params.user_id || params.subid1}${params.click_id}${params.currency_amount}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "bitlabs": {
        // BitLabs uses HMAC-SHA1: hmac_sha1(user_id + tx_id, secret)
        const dataStr = `${params.user_id}${params.tx_id || params.transaction_id}`
        const expectedSig = createHmac("sha1", secret).update(dataStr).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "ayet-studios": {
        // Ayet Studios uses MD5: md5(user_id + amount + transaction_id + secret)
        const expectedSig = createHash("md5")
          .update(`${params.external_identifier || params.user_id}${params.amount}${params.transaction_id}${secret}`)
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "hang-my-ads": {
        // HangMyAds uses SHA256: sha256(user_id + offer_id + payout + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id}${params.offer_id}${params.payout}${secret}`)
          .digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      case "notik": {
        // Notik uses HMAC-SHA256
        const dataStr = `${params.userId || params.user_id}${params.transactionId || params.transaction_id}${params.reward}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signature.toLowerCase() === expectedSig.toLowerCase()
      }

      default:
        return false
    }
  } catch (error) {
    console.error(`[Postback] Signature validation error for ${provider}:`, error)
    return false
  }
}

function validateProviderIP(provider: string, requestIP: string): boolean {
  const whitelist = PROVIDER_IP_WHITELIST[provider]

  // If no whitelist configured, allow all IPs
  if (!whitelist || whitelist.length === 0) {
    return true
  }

  return whitelist.some((allowedIP) => {
    // Support CIDR notation in the future
    return requestIP === allowedIP || requestIP.startsWith(allowedIP.replace(/\.\d+$/, ""))
  })
}

// Parse postback parameters from different providers
function parsePostbackParams(provider: string, searchParams: URLSearchParams): PostbackParams | null {
  try {
    switch (provider) {
      case "ccxua":
        return {
          userId: searchParams.get("subId") || "",
          offerId: searchParams.get("transId") || "",
          offerName: searchParams.get("offer_name") || "c.cx.ua Offer",
          // c.cx.ua sends `reward` already converted into your virtual currency
          // using the Exchange Rate set in your c.cx.ua dashboard
          // (recommend setting it to 100000 = sats per 1 USD).
          // We use that reward directly and keep conversion_rate=1.0 in the DB.
          credits: Number.parseFloat(searchParams.get("reward") || "0"),
          transactionId: searchParams.get("transId") || "",
          ip: searchParams.get("userIp") || "",
        }

      case "cpx-research":
        return {
          userId: searchParams.get("user_id") || searchParams.get("ext_user_id") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("survey_id") || "",
          offerName: searchParams.get("offer_name") || "CPX Survey",
          credits: Number.parseFloat(searchParams.get("amount_usd") || "0") * 100,
          transactionId: searchParams.get("trans_id") || searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "torox":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "Torox Offer",
          credits: Number.parseFloat(searchParams.get("payout") || "0"),
          transactionId: searchParams.get("id") || "",
          ip: searchParams.get("user_ip") || "",
        }

      case "lootably":
        return {
          userId: searchParams.get("userId") || "",
          offerId: searchParams.get("offerId") || "",
          offerName: searchParams.get("offerName") || "Lootably Offer",
          credits: Number.parseFloat(searchParams.get("payout") || "0"),
          transactionId: searchParams.get("transactionId") || "",
        }

      case "adgate":
        return {
          userId: searchParams.get("user_id") || searchParams.get("s1") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "AdGate Offer",
          credits: Number.parseFloat(searchParams.get("point_value") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip_address") || "",
        }

      case "mm-wall":
        return {
          userId: searchParams.get("user_id") || searchParams.get("subid") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "MM Wall Offer",
          credits: Number.parseFloat(searchParams.get("reward") || "0"),
          transactionId: searchParams.get("txid") || "",
        }

      case "timewall":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "Timewall Offer",
          credits: Number.parseFloat(searchParams.get("amount") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
        }


      case "offerwall-me":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "Offerwall.me Offer",
          credits: Number.parseFloat(searchParams.get("amount") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "bicotasks":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "Bicotasks Offer",
          credits: Number.parseFloat(searchParams.get("amount") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "adscend":
        return {
          userId: searchParams.get("user_id") || searchParams.get("subid1") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "Adscend Offer",
          credits: Number.parseFloat(searchParams.get("currency_amount") || "0"),
          transactionId: searchParams.get("click_id") || "",
        }

      case "bitlabs":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("survey_id") || "",
          offerName: searchParams.get("offer_name") || "BitLabs Survey",
          credits: Number.parseFloat(searchParams.get("reward") || searchParams.get("amount") || "0"),
          transactionId: searchParams.get("tx_id") || searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "ayet-studios":
        return {
          userId: searchParams.get("external_identifier") || searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("campaign_id") || "",
          offerName: searchParams.get("offer_name") || searchParams.get("campaign_name") || "Ayet Studios Offer",
          credits: Number.parseFloat(searchParams.get("amount") || searchParams.get("payout") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "hang-my-ads":
        return {
          userId: searchParams.get("user_id") || "",
          offerId: searchParams.get("offer_id") || "",
          offerName: searchParams.get("offer_name") || "HangMyAds Offer",
          credits: Number.parseFloat(searchParams.get("payout") || searchParams.get("amount") || "0"),
          transactionId: searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "notik":
        return {
          userId: searchParams.get("userId") || searchParams.get("user_id") || "",
          offerId: searchParams.get("offerId") || searchParams.get("offer_id") || "",
          offerName: searchParams.get("offerName") || searchParams.get("offer_name") || "Notik Offer",
          credits: Number.parseFloat(searchParams.get("reward") || searchParams.get("amount") || "0"),
          transactionId: searchParams.get("transactionId") || searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      default:
        return null
    }
  } catch {
    return null
  }
}

// ── Tournament score helper ───────────────────────────────────────────────────
// Fire-and-forget: updates offerwall_earnings + highest_earners for all
// three periods. Never blocks the postback response.
function updateOfferwallTournamentScores(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  amountSatoshis: number,
) {
  const periods = ["daily", "weekly", "monthly"] as const
  const calls = [
    // offerwall_earnings — tracks satoshis earned from offerwalls
    ...periods.map((period) =>
      supabaseAdmin.rpc("update_tournament_score", {
        p_user_id: userId,
        p_category: "offerwall_earnings",
        p_period: period,
        p_score_delta: amountSatoshis,
      }),
    ),
    // highest_earners — tracks total satoshis earned from all sources
    ...periods.map((period) =>
      supabaseAdmin.rpc("update_tournament_score", {
        p_user_id: userId,
        p_category: "highest_earners",
        p_period: period,
        p_score_delta: amountSatoshis,
      }),
    ),
  ]
  Promise.allSettled(calls).catch(() => { })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { provider } = await params
    const searchParams = request.nextUrl.searchParams
    const signature = searchParams.get("sig") || searchParams.get("signature") || searchParams.get("hash") || ""

    // Get request IP for logging and optional whitelist check
    const requestIP =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"

    // Validate provider
    const validProviders = [
      "ccxua",
      "cpx-research",
      "torox",
      "lootably",
      "adgate",
      "mm-wall",
      "timewall",
      "offerwall-me",
      "bicotasks",
      "adscend",
      "bitlabs",
      "ayet-studios",
      "hang-my-ads",
      "notik",
    ]
    if (!validProviders.includes(provider)) {
      console.warn(`[Postback] Invalid provider attempt: ${provider} from IP: ${requestIP}`)
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }

    if (!validateProviderIP(provider, requestIP)) {
      console.warn(`[Postback] IP not whitelisted for ${provider}: ${requestIP}`)
      return NextResponse.json({ error: "Unauthorized IP" }, { status: 403 })
    }

    // Validate signature
    const paramsObj: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      paramsObj[key] = value
    })

    if (!validateSignature(provider, paramsObj, signature)) {
      console.warn(`[Postback] Invalid signature for ${provider} from IP: ${requestIP}`)
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    // Parse parameters
    const postbackParams = parsePostbackParams(provider, searchParams)
    if (!postbackParams || !postbackParams.userId || !postbackParams.transactionId) {
      console.warn(`[Postback] Missing parameters for ${provider}:`, {
        hasUserId: !!postbackParams?.userId,
        hasTransactionId: !!postbackParams?.transactionId,
      })
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // c.cx.ua sends status=2 for chargebacks (offer reversal).
    // We log the chargeback for review but acknowledge it so it isn't retried.
    if (provider === "ccxua" && searchParams.get("status") === "2") {
      console.warn(
        `[Postback] ccxua chargeback received - user: ${postbackParams.userId}, tx: ${postbackParams.transactionId}, reward: ${searchParams.get("reward")}`,
      )
      try {
        await supabaseAdmin.from("offerwall_conversions").insert({
          user_id: postbackParams.userId,
          provider_id: null,
          offer_id: postbackParams.offerId,
          offer_name: `${postbackParams.offerName} (CHARGEBACK)`,
          payout_credits: -Math.abs(postbackParams.credits),
          payout_satoshis: 0,
          transaction_id: `cb_${postbackParams.transactionId}`,
          ip_address: postbackParams.ip || requestIP,
          status: "chargeback",
          processed_at: new Date().toISOString(),
          metadata: { request_ip: requestIP, raw_params: paramsObj, chargeback: true },
        })
      } catch (cbErr) {
        console.error("[Postback] Chargeback logging error:", cbErr)
      }
      return new NextResponse("ok", { status: 200, headers: { "Content-Type": "text/plain" } })
    }

    // This prevents race conditions between SELECT and INSERT

    // Get provider details first
    const { data: providerData } = await supabaseAdmin
      .from("offerwall_providers")
      .select("id, conversion_rate")
      .eq("slug", provider)
      .single()

    if (!providerData) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 })
    }

    // Calculate satoshi payout
    const payoutSatoshis = Math.floor(postbackParams.credits * (providerData.conversion_rate || 1))

    // Verify user exists and get current balance
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, balance_satoshis, total_earned_satoshis")
      .eq("id", postbackParams.userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If transaction_id already exists, this will do nothing (ignoreDuplicates)
    const { data: conversion, error: conversionError } = await supabaseAdmin
      .from("offerwall_conversions")
      .upsert(
        {
          user_id: postbackParams.userId,
          provider_id: providerData.id,
          offer_id: postbackParams.offerId,
          offer_name: postbackParams.offerName,
          payout_credits: postbackParams.credits,
          payout_satoshis: payoutSatoshis,
          transaction_id: postbackParams.transactionId,
          ip_address: postbackParams.ip || requestIP,
          status: "approved",
          processed_at: new Date().toISOString(),
          metadata: {
            request_ip: requestIP,
            raw_params: paramsObj,
          },
        },
        {
          onConflict: "transaction_id",
          ignoreDuplicates: true,
        },
      )
      .select("id, created_at")
      .single()

    // Check if this was a duplicate (no row returned with ignoreDuplicates)
    if (!conversion) {
      // Double-check if it exists
      const { data: existing } = await supabaseAdmin
        .from("offerwall_conversions")
        .select("id")
        .eq("transaction_id", postbackParams.transactionId)
        .single()

      if (existing) {
        console.log(`[Postback] Duplicate transaction ignored: ${postbackParams.transactionId}`)
        const dupText = PROVIDER_DUPLICATE_RESPONSE[provider]
        if (dupText) {
          return new NextResponse(dupText, { status: 200, headers: { "Content-Type": "text/plain" } })
        }
        return NextResponse.json({ status: "duplicate" }, { status: 200 })
      }
    }

    if (conversionError) {
      // Handle unique constraint violation (duplicate)
      if (conversionError.code === "23505") {
        console.log(`[Postback] Duplicate transaction: ${postbackParams.transactionId}`)
        const dupText = PROVIDER_DUPLICATE_RESPONSE[provider]
        if (dupText) {
          return new NextResponse(dupText, { status: 200, headers: { "Content-Type": "text/plain" } })
        }
        return NextResponse.json({ status: "duplicate" }, { status: 200 })
      }
      console.error("[Postback] Conversion error:", conversionError)
      return NextResponse.json({ error: "Failed to create conversion" }, { status: 500 })
    }

    const newBalance = profile.balance_satoshis + payoutSatoshis
    const newTotalEarned = (profile.total_earned_satoshis || 0) + payoutSatoshis

    const { error: balanceError } = await supabaseAdmin
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: newTotalEarned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postbackParams.userId)
      .eq("balance_satoshis", profile.balance_satoshis)

    if (balanceError) {
      console.error("[Postback] Balance update error:", balanceError)
      // Mark conversion as needing review if balance update failed
      await supabaseAdmin
        .from("offerwall_conversions")
        .update({
          status: "pending",
          metadata: {
            balance_update_failed: true,
            error: balanceError.message,
          },
        })
        .eq("transaction_id", postbackParams.transactionId)

      return NextResponse.json({ error: "Balance update failed, conversion pending review" }, { status: 500 })
    }

    const { data: providerStats } = await supabaseAdmin
      .from("offerwall_providers")
      .select("total_conversions, total_paid_satoshis")
      .eq("id", providerData.id)
      .single()

    if (providerStats) {
      await supabaseAdmin
        .from("offerwall_providers")
        .update({
          total_conversions: (providerStats.total_conversions || 0) + 1,
          total_paid_satoshis: (providerStats.total_paid_satoshis || 0) + payoutSatoshis,
          updated_at: new Date().toISOString(),
        })
        .eq("id", providerData.id)
    }

    // Create transaction record
    await supabaseAdmin.from("transactions").insert({
      user_id: postbackParams.userId,
      type: "offerwall",
      amount_satoshis: payoutSatoshis,
      balance_before: profile.balance_satoshis,
      balance_after: newBalance,
      status: "completed",
      description: `${postbackParams.offerName} (${provider})`,
      metadata: {
        provider,
        offer_id: postbackParams.offerId,
        transaction_id: postbackParams.transactionId,
      },
    })

    // Create notification
    await supabaseAdmin.from("notifications").insert({
      user_id: postbackParams.userId,
      type: "offerwall_credit",
      title: "Offerwall Reward!",
      message: `You earned ${payoutSatoshis} satoshis from ${postbackParams.offerName}`,
      metadata: {
        amount: payoutSatoshis,
        provider,
        offer_name: postbackParams.offerName,
      },
    })

    // Update tournament scores (non-blocking)
    updateOfferwallTournamentScores(supabaseAdmin, postbackParams.userId, payoutSatoshis)

    console.log(`[Postback] Success: ${provider} - User: ${postbackParams.userId} - Amount: ${payoutSatoshis} sats`)

    // Return success — providers expect different plain-text bodies
    const okText = PROVIDER_OK_RESPONSE[provider] || "1"
    return new NextResponse(okText, { status: 200, headers: { "Content-Type": "text/plain" } })
  } catch (error) {
    console.error("[Postback] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Some providers use POST for postbacks
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return GET(request, { params })
}
