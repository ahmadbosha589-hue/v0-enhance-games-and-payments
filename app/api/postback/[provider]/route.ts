import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac, createHash, timingSafeEqual } from "crypto"

interface PostbackParams {
  userId: string
  offerId: string
  offerName?: string
  credits: number
  transactionId: string
  ip?: string
  userAgent?: string
}

// All secrets are trimmed: a single trailing space/newline pasted into an
// env var makes EVERY md5/hmac signature check fail with 403, which the
// provider dashboard surfaces as "Postback Failed" — an extremely common
// and painful-to-debug misconfiguration. Trimming is always safe because
// no offerwall issues secrets with meaningful leading/trailing whitespace.
// ── OPERATOR SETUP: OFFERWALL POSTBACK SECRETS ───────────────────────────────
// Every wall below is only able to credit users when its secret env var is
// set. A missing secret makes the handler FAIL CLOSED (403 invalid-signature)
// — it never credits unverified postbacks. The offerwalls API mirrors this by
// rendering the wall as "Setup Required" (still visible) until the secret is
// configured. Operators must set:
//
//   Legacy walls (pre-existing scheme):
//     CCXUA_SECRET_KEY            c.cx.ua            (MD5 subId+transId+reward+secret)
//     CPX_SECRET_KEY              CPX Research
//     TOROX_SECRET_KEY            Torox
//     LOOTABLY_SECRET_KEY         Lootably
//     ADGATE_SECRET_KEY           AdGate Media
//     MM_WALL_SECRET_KEY          MM Wall
//     TIMEWALL_SECRET_KEY         Timewall
//     OFFERWALLME_SECRET_KEY      Offerwall.me
//     BICOTASKS_SECRET_KEY        BicoTasks
//     ADSCEND_SECRET_KEY          Adscend Media
//     BITLABS_SECRET_KEY          BitLabs
//     AYET_STUDIOS_SECRET_KEY     ayeT-Studios
//     HANG_MY_ADS_SECRET_KEY      HangMyAds
//     NOTIK_SECRET_KEY            Notik
//
//   Walls implemented in the phantom-offerwalls pass (HMAC-SHA256 over
//   sorted params — see validateSignature for per-provider assumptions):
//     OFFERWALL_WANNADS_SECRET        Wannads
//     OFFERWALL_MONLIX_SECRET         Monlix
//     OFFERWALL_REVU_SECRET           Revenue Universe (revu)
//     OFFERWALL_ADGEM_SECRET          AdGem
//     OFFERWALL_POLLFISH_SECRET       Pollfish
//     OFFERWALL_THEOREMREACH_SECRET   TheoremReach
//     OFFERWALL_CPALEAD_SECRET        CPALead
//     OFFERWALL_MINUTESTAFF_SECRET    MinuteStaff
//
// DB rows for all of the above are seeded idempotently by
// scripts/095_ccxua_and_provider_seeds.sql (secrets live ONLY in env vars —
// never in the database).
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDER_SECRETS: Record<string, string> = {
  ccxua: (process.env.CCXUA_SECRET_KEY || "").trim(),
  "cpx-research": (process.env.CPX_SECRET_KEY || "").trim(),
  torox: (process.env.TOROX_SECRET_KEY || "").trim(),
  lootably: (process.env.LOOTABLY_SECRET_KEY || "").trim(),
  adgate: (process.env.ADGATE_SECRET_KEY || "").trim(),
  "mm-wall": (process.env.MM_WALL_SECRET_KEY || "").trim(),
  timewall: (process.env.TIMEWALL_SECRET_KEY || "").trim(),
  "offerwall-me": (process.env.OFFERWALLME_SECRET_KEY || "").trim(),
  bicotasks: (process.env.BICOTASKS_SECRET_KEY || "").trim(),
  adscend: (process.env.ADSCEND_SECRET_KEY || "").trim(),
  bitlabs: (process.env.BITLABS_SECRET_KEY || "").trim(),
  "ayet-studios": (process.env.AYET_STUDIOS_SECRET_KEY || "").trim(),
  "hang-my-ads": (process.env.HANG_MY_ADS_SECRET_KEY || "").trim(),
  notik: (process.env.NOTIK_SECRET_KEY || "").trim(),
  wannads: (process.env.OFFERWALL_WANNADS_SECRET || "").trim(),
  monlix: (process.env.OFFERWALL_MONLIX_SECRET || "").trim(),
  revu: (process.env.OFFERWALL_REVU_SECRET || "").trim(),
  adgem: (process.env.OFFERWALL_ADGEM_SECRET || "").trim(),
  pollfish: (process.env.OFFERWALL_POLLFISH_SECRET || "").trim(),
  theoremreach: (process.env.OFFERWALL_THEOREMREACH_SECRET || "").trim(),
  cpalead: (process.env.OFFERWALL_CPALEAD_SECRET || "").trim(),
  minutestaff: (process.env.OFFERWALL_MINUTESTAFF_SECRET || "").trim(),
}

// Slug aliases: the UI/offerwall registry uses "adgatemedia" while the
// postback route + DB row (offerwall_providers.slug) use the provider's own
// canonical name "adgate". An alias (preferred over a rename) keeps old
// postback links working and lets both slugs resolve to the same provider
// row. Aliases are resolved once, at the top of handlePostback.
const PROVIDER_ALIASES: Record<string, string> = {
  adgatemedia: "adgate",
}

function canonicalProvider(provider: string): string {
  return PROVIDER_ALIASES[provider] ?? provider
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

// Providers that expect a specific plain-text response body.
// c.cx.ua's official S2S docs (https://c.cx.ua/docs/#ow_response) are
// explicit: "Our servers will expect your website to respond with 'ok'.
// If your postback doesn't return 'ok' as response, postback will be
// marked as failed (even if postback was successfully called)."
// Every PHP example in their docs uses `echo "ok";` (lowercase) and the
// response is whitespace-/case-sensitive. Returning anything else (e.g.
// "OK", "1", JSON, "DUP") causes c.cx.ua to flag the postback Failed in
// their dashboard and retry up to 5x even though we already credited the
// user — producing the "no completions in dashboard" symptom.
const PROVIDER_OK_RESPONSE: Record<string, string> = {
  ccxua: "ok",
}

// The official c.cx.ua S2S contract only recognises "ok" as success — there
// is no documented "DUP" sentinel (that token comes from the legacy Vie
// Faucet sample code, not the S2S spec). For an already-processed
// transaction we still return "ok" so c.cx.ua marks the postback as
// successful and stops retrying. Idempotency is enforced server-side via
// the unique constraint on `offerwall_conversions.transaction_id`.
const PROVIDER_DUPLICATE_RESPONSE: Record<string, string> = {
  ccxua: "ok",
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function signaturesEqual(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received.trim().toLowerCase(), "utf8")
  const expectedBytes = Buffer.from(expected.trim().toLowerCase(), "utf8")
  if (receivedBytes.length !== expectedBytes.length) return false
  return timingSafeEqual(receivedBytes, expectedBytes)
}

// Generic scheme used by the walls implemented in the phantom-offerwalls
// pass: HMAC-SHA256 over the postback params sorted alphabetically,
// serialized as `key=value` pairs joined with `&` (signature-carrying keys
// excluded), keyed with the provider secret. This is the most widely
// documented offerwall convention and the one the implementation directive
// specifies where per-provider documentation is uncertain — each switch case
// below notes its assumption explicitly.
function hmacSortedParams(params: Record<string, string>, secret: string): string {
  const sortedParams = Object.keys(params)
    .filter((k) => k !== "sig" && k !== "signature" && k !== "hash")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return createHmac("sha256", secret).update(sortedParams).digest("hex")
}

function validateSignature(provider: string, params: Record<string, string>, signature: string): boolean {
  const secret = PROVIDER_SECRETS[provider]

  // A missing secret must never turn a balance-credit endpoint into an
  // unauthenticated public API. Development can still use unsigned local
  // callbacks, but production fails closed until the provider secret exists.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[Postback] Rejecting ${provider}: provider secret is not configured`)
      return false
    }
    console.warn(`[Postback] DEV ONLY: no secret for "${provider}" — accepting unsigned callback`)
    return true
  }

  try {
    switch (provider) {
      case "ccxua": {
        // c.cx.ua uses MD5: md5(subId + transId + reward + secret)
        const expectedSig = createHash("md5")
          .update(`${params.subId}${params.transId}${params.reward}${secret}`)
          .digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "cpx-research": {
        // CPX Research postback hash. PRIMARY per the official dashboard:
        //   md5({trans_id}-SECRET)
        // Fallbacks kept for older mirrored guide variants so legacy links
        // keep verifying; every candidate is logged on mismatch (see handler).
        const trans = params.trans_id || params.transaction_id || ""

        // Documented primary: md5(transId-secret)
        const docScheme = createHash("md5").update(`${trans}-${secret}`).digest("hex")
        if (signaturesEqual(signature, docScheme)) return true

        // Legacy v1: md5(trans-user-amountUSD-secret)
        const user = params.user_id || params.ext_user_id || ""
        const amountUsd = params.amount_usd || ""
        const v1 = createHash("md5")
          .update(`${trans}-${user}-${amountUsd}-${secret}`)
          .digest("hex")
        if (signaturesEqual(signature, v1)) return true

        // Legacy v2: md5(trans-user-amountUSD-currency-secret)
        const currency = params.currency || "USD"
        const v2 = createHash("md5")
          .update(`${trans}-${user}-${amountUsd}-${currency}-${secret}`)
          .digest("hex")
        return signaturesEqual(signature, v2)
      }

      case "torox": {
        // Torox uses HMAC-SHA256 of sorted params
        const sortedParams = Object.keys(params)
          .filter((k) => k !== "sig" && k !== "signature")
          .sort()
          .map((k) => `${k}=${params[k]}`)
          .join("&")
        const expectedSig = createHmac("sha256", secret).update(sortedParams).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "lootably": {
        // Lootably uses SHA1: sha1(transactionId + secret)
        const expectedSig = createHash("sha1").update(`${params.transactionId}${secret}`).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "adgate": {
        // AdGate uses MD5: md5(transaction_id + secret)
        const expectedSig = createHash("md5").update(`${params.transaction_id}${secret}`).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "mm-wall": {
        // MM Wall uses SHA256: sha256(user_id + offer_id + reward + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id || params.subid}${params.offer_id}${params.reward}${secret}`)
          .digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "timewall": {
        // Timewall uses HMAC-SHA256
        const dataStr = `${params.user_id}${params.amount}${params.transaction_id}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }


      case "offerwall-me": {
        // Offerwall.me uses HMAC-SHA256: hmac_sha256(user_id + transaction_id, secret)
        const dataStr = `${params.user_id}${params.transaction_id}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "bicotasks": {
        // Bicotasks uses SHA256: sha256(user_id + offer_id + amount + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id}${params.offer_id}${params.amount}${secret}`)
          .digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "adscend": {
        // Adscend uses SHA256 HMAC
        const dataStr = `${params.user_id || params.subid1}${params.click_id}${params.currency_amount}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "bitlabs": {
        // BitLabs uses HMAC-SHA1: hmac_sha1(user_id + tx_id, secret)
        const dataStr = `${params.user_id}${params.tx_id || params.transaction_id}`
        const expectedSig = createHmac("sha1", secret).update(dataStr).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "ayet-studios": {
        // Ayet Studios uses MD5: md5(user_id + amount + transaction_id + secret)
        const expectedSig = createHash("md5")
          .update(`${params.external_identifier || params.user_id}${params.amount}${params.transaction_id}${secret}`)
          .digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "hang-my-ads": {
        // HangMyAds uses SHA256: sha256(user_id + offer_id + payout + secret)
        const expectedSig = createHash("sha256")
          .update(`${params.user_id}${params.offer_id}${params.payout}${secret}`)
          .digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "notik": {
        // Notik uses HMAC-SHA256
        const dataStr = `${params.userId || params.user_id}${params.transactionId || params.transaction_id}${params.reward}`
        const expectedSig = createHmac("sha256", secret).update(dataStr).digest("hex")
        return signaturesEqual(signature, expectedSig)
      }

      case "wannads": {
        // Wannads: HMAC-SHA256 over sorted params (implementation directive).
        // ASSUMPTION: Wannads' dashboard-configured postback signs the full
        // parameter set (excluding the signature key itself) sorted
        // alphabetically as k=v pairs joined with "&". If their account
        // manager specifies a different scheme, update this case — until
        // then any mismatch fails closed with 403 and credits nobody.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "monlix": {
        // Monlix: HMAC-SHA256 over sorted params.
        // ASSUMPTION: Monlix's public docs do not pin an exact canonical
        // string; we use the standard sorted-params HMAC-SHA256 convention.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "revu": {
        // Revenue Universe: HMAC-SHA256 over sorted params.
        // ASSUMPTION: RevU's postback verification scheme is only shared via
        // their publisher portal; the standard sorted-params HMAC-SHA256
        // convention is used here.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "adgem": {
        // AdGem: HMAC-SHA256 over sorted params.
        // ASSUMPTION: AdGem's S2S callback signs all non-signature params,
        // sorted alphabetically, joined k=value with "&" (their most commonly
        // documented S2S shape). Verify against your AdGem app settings.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "pollfish": {
        // Pollfish: HMAC-SHA256 over sorted params.
        // ASSUMPTION: Pollfish fires a publisher-configured S2S URL template;
        // no public signature spec exists for it, so the standard
        // sorted-params HMAC-SHA256 convention is used here.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "theoremreach": {
        // TheoremReach: HMAC-SHA256 over sorted params.
        // ASSUMPTION: TheoremReach's integration guide does not publish a
        // stable public signature formula; the standard sorted-params
        // HMAC-SHA256 convention is used here.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "cpalead": {
        // CPALead: HMAC-SHA256 over sorted params.
        // ASSUMPTION: CPALead gateway postbacks are configurable per offer
        // wall; where a signature is enabled we use the standard
        // sorted-params HMAC-SHA256 convention keyed with the wall secret.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
      }

      case "minutestaff": {
        // MinuteStaff: HMAC-SHA256 over sorted params.
        // ASSUMPTION: MinuteStaff's postback signature scheme is shared via
        // their publisher dashboard; the standard sorted-params HMAC-SHA256
        // convention is used here.
        return signaturesEqual(signature, hmacSortedParams(params, secret))
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
      case "ccxua": {
        // c.cx.ua's S2S postback (per https://c.cx.ua/docs/ → "S2S Postback")
        // sends: subId, transId, offer_name, offer_type, reward, reward_name,
        //        reward_value, payout, userIp, country, status, debug, signature
        // Documented offer_type values: ptc | offer | task | shortlink
        // (a PPC/PTC campaign like Zerpayz arrives as offer_type=ptc).
        // `transId` is the unique postback id we use for deduplication.
        const offerType = (searchParams.get("offer_type") || "").toLowerCase()
        const campaignId = searchParams.get("campaign_id") || ""
        const defaultName =
          offerType === "shortlink"
            ? "c.cx.ua Shortlink"
            : offerType === "ptc"
              ? "c.cx.ua PTC Ad"
              : offerType === "task"
                ? "c.cx.ua Task"
                : "c.cx.ua Offer"
        return {
          userId: searchParams.get("subId") || "",
          offerId: campaignId || searchParams.get("transId") || "",
          offerName: searchParams.get("offer_name") || defaultName,
          // c.cx.ua sends `reward` already converted into your virtual
          // currency using the Exchange Rate set in your c.cx.ua dashboard
          // (Exchange Rate = credits per $1 of offer payout). For PTC
          // payouts as small as $0.000250 the resulting credit can be
          // fractional, so we keep it as a float here — the satoshi
          // conversion below rounds and floors at >= 1 sat for any
          // positive credit so micro-PTC clicks still pay out.
          credits: Number.parseFloat(searchParams.get("reward") || "0"),
          transactionId: searchParams.get("transId") || "",
          ip: searchParams.get("userIp") || "",
        }
      }

      case "cpx-research": {
        // CPX dashboard placeholders (exact names):
        //   {status} 1=completed 2=canceled/reversed
        //   {trans_id} {user_id} {subid_1}/{subid_2}
        //   {amount_local} {amount_usd} {offer_ID} {ip_click} {type}
        // user identity: we pass our UUID as {user_id}; ext_user_id kept as a
        // legacy fallback for older links.
        const statusRaw = searchParams.get("status") || "1"
        const isReversal = statusRaw === "2"
        return {
          userId:
            searchParams.get("user_id") ||
            searchParams.get("ext_user_id") ||
            searchParams.get("subid_1") ||
            "",
          offerId: searchParams.get("offer_id") || searchParams.get("survey_id") || "",
          offerName: searchParams.get("offer_name") || `CPX Survey (${searchParams.get("type") || "complete"})`,
          credits: Number.parseFloat(searchParams.get("amount_usd") || "0") * 100,
          transactionId:
            (isReversal ? "rev_" : "") +
            (searchParams.get("trans_id") || searchParams.get("transaction_id") || ""),
          ip: searchParams.get("ip_click") || searchParams.get("ip") || "",
        }
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

      // ── Phantom-offerwall pass (wannads … minutestaff) ─────────────────────
      // Contract for all eight walls below: `credits` is the offer payout in
      // USD (the postback's dollar-denominated field). The satoshi amount is
      // computed downstream as credits × offerwall_providers.conversion_rate,
      // and scripts/095_ccxua_and_provider_seeds.sql seeds each row's
      // conversion_rate to match the rate shown in the UI (sats per $1).
      // Param reads accept the common spellings each network uses; unknown
      // params are still included in signature verification (raw params are
      // hashed verbatim), so parsing leniency never bypasses authentication.
      case "wannads":
        return {
          userId: searchParams.get("subid") || searchParams.get("user_id") || searchParams.get("userid") || "",
          offerId: searchParams.get("offerid") || searchParams.get("offer_id") || "",
          offerName: searchParams.get("offername") || searchParams.get("offer_name") || "Wannads Offer",
          credits:
            Number.parseFloat(
              searchParams.get("payout") || searchParams.get("amount_usd") || searchParams.get("amount") || "0",
            ) || 0,
          transactionId: searchParams.get("transid") || searchParams.get("transaction_id") || searchParams.get("trans_id") || "",
          ip: searchParams.get("ip") || searchParams.get("user_ip") || "",
        }

      case "monlix":
        return {
          userId: searchParams.get("user_id") || searchParams.get("userid") || searchParams.get("userId") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("offerid") || "",
          offerName: searchParams.get("offer_name") || searchParams.get("offername") || "Monlix Offer",
          credits:
            Number.parseFloat(
              searchParams.get("payout") || searchParams.get("amount_usd") || searchParams.get("amount") || "0",
            ) || 0,
          transactionId:
            searchParams.get("transaction_id") || searchParams.get("trans_id") || searchParams.get("txn_id") || "",
          ip: searchParams.get("ip") || searchParams.get("user_ip") || "",
        }

      case "revu":
        return {
          userId: searchParams.get("user_id") || searchParams.get("userid") || searchParams.get("subid") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("survey_id") || "",
          offerName: searchParams.get("offer_name") || "Revenue Universe Offer",
          credits:
            Number.parseFloat(
              searchParams.get("reward") ||
                searchParams.get("points") ||
                searchParams.get("amount_usd") ||
                searchParams.get("amount") ||
                "0",
            ) || 0,
          transactionId:
            searchParams.get("transaction_id") || searchParams.get("trans_id") || searchParams.get("txid") || "",
          ip: searchParams.get("ip") || searchParams.get("user_ip") || "",
        }

      case "adgem":
        return {
          userId: searchParams.get("user_id") || searchParams.get("userId") || searchParams.get("player_id") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("campaign_id") || "",
          offerName: searchParams.get("offer_name") || searchParams.get("offerName") || "AdGem Offer",
          credits:
            Number.parseFloat(
              searchParams.get("currency_amount") || searchParams.get("amount") || searchParams.get("payout") || "0",
            ) || 0,
          transactionId:
            searchParams.get("transaction_id") || searchParams.get("txn_id") || searchParams.get("tid") || "",
          ip: searchParams.get("ip") || searchParams.get("user_ip") || "",
        }

      case "pollfish":
        return {
          userId: searchParams.get("user_id") || searchParams.get("uid") || searchParams.get("userId") || "",
          offerId:
            searchParams.get("survey_id") || searchParams.get("offer_id") || searchParams.get("request_uuid") || "",
          offerName: searchParams.get("survey_name") || searchParams.get("offer_name") || "Pollfish Survey",
          // Pollfish reports survey completion value via its reward/CPA fields.
          credits:
            Number.parseFloat(
              searchParams.get("reward") || searchParams.get("cpa_credit") || searchParams.get("amount") || "0",
            ) || 0,
          // request_uuid is Pollfish's per-completion identifier.
          transactionId:
            searchParams.get("request_uuid") || searchParams.get("transaction_id") || searchParams.get("tx_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "theoremreach":
        return {
          userId: searchParams.get("user_id") || searchParams.get("userId") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("survey_id") || "",
          offerName: searchParams.get("offer_name") || "TheoremReach Survey",
          credits:
            Number.parseFloat(
              searchParams.get("currency_amount") || searchParams.get("reward") || searchParams.get("amount") || "0",
            ) || 0,
          transactionId:
            searchParams.get("uniqueId") || searchParams.get("unique_id") || searchParams.get("transaction_id") || "",
          ip: searchParams.get("ip") || "",
        }

      case "cpalead":
        return {
          userId: searchParams.get("sub_id") || searchParams.get("user_id") || searchParams.get("subid") || "",
          offerId: searchParams.get("offer_id") || searchParams.get("campaign_id") || searchParams.get("camp_id") || "",
          offerName: searchParams.get("offer_name") || searchParams.get("campaign_name") || "CPALead Offer",
          credits:
            Number.parseFloat(
              searchParams.get("payout") || searchParams.get("earnings") || searchParams.get("amount") || "0",
            ) || 0,
          // No synthetic fallback: if CPALead sends no unique id we fail with
          // 400 missing-parameters rather than risk replay/dedup collisions.
          transactionId:
            searchParams.get("transaction_id") || searchParams.get("tid") || searchParams.get("click_id") || "",
          ip: searchParams.get("ip") || searchParams.get("user_ip") || "",
        }

      case "minutestaff":
        return {
          userId: searchParams.get("userid") || searchParams.get("user_id") || searchParams.get("userId") || "",
          offerId: searchParams.get("task_id") || searchParams.get("campaign_id") || searchParams.get("offer_id") || "",
          offerName: searchParams.get("task_name") || searchParams.get("offer_name") || "MinuteStaff Task",
          credits:
            Number.parseFloat(
              searchParams.get("reward") || searchParams.get("amount_usd") || searchParams.get("amount") || "0",
            ) || 0,
          // Strict unique-id read — task_id repeats across completions and is
          // deliberately NOT used as a dedup key fallback.
          transactionId: searchParams.get("transaction_id") || searchParams.get("txn_id") || "",
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

// ─────────────────────────────────────────────────────────────────────────────
// Core handler. Receives an already-merged URLSearchParams (URL params + any
// POST body params) and the raw request (used only for headers/IP). Both GET
// and POST entry points call this so the logic lives in one place and we
// don't have to clone NextRequest objects (which is fragile because
// content-length from the original POST body leaks onto the body-less GET
// replay and breaks under-the-hood fetch validation).
// ─────────────────────────────────────────────────────────────────────────────
async function handlePostback(
  request: NextRequest,
  provider: string,
  searchParams: URLSearchParams,
): Promise<NextResponse> {
  const supabaseAdmin = getSupabaseAdmin()

  try {
    const signature = searchParams.get("sig") || searchParams.get("signature") || searchParams.get("hash") || ""

    // Get request IP for logging and optional whitelist check
    const requestIP =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"

    // Validate provider. Aliases (UI slug ↔ DB/postback slug) are resolved
    // first so both spellings reach the same provider row — see
    // PROVIDER_ALIASES ("adgatemedia" → "adgate").
    const validProviders = [
      "ccxua",
      "cpx-research",
      "torox",
      "lootably",
      "adgate",
      "adgatemedia", // alias of adgate — resolved below, kept listed for registry completeness
      "mm-wall",
      "timewall",
      "offerwall-me",
      "bicotasks",
      "adscend",
      "bitlabs",
      "ayet-studios",
      "hang-my-ads",
      "notik",
      "wannads",
      "monlix",
      "revu",
      "adgem",
      "pollfish",
      "theoremreach",
      "cpalead",
      "minutestaff",
    ]
    provider = canonicalProvider(provider)
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
      const debug: Record<string, unknown> = {
        receivedSignature: signature,
        rawParams: paramsObj,
      }
      if (provider === "cpx-research" && process.env.CPX_SECRET_KEY) {
        // Surface ALL accepted candidates so a dashboard misconfiguration is
        // diagnosable from the logs without guessing. expected_doc is the
        // officially documented md5({trans_id}-SECRET).
        const trans = paramsObj.trans_id || paramsObj.transaction_id || ""
        const user = paramsObj.user_id || paramsObj.ext_user_id || ""
        const secret = process.env.CPX_SECRET_KEY.trim()
        debug.expected_doc = createHash("md5").update(`${trans}-${secret}`).digest("hex")
        debug.expected_v1 = createHash("md5")
          .update(`${trans}-${user}-${paramsObj.amount_usd || ""}-${secret}`)
          .digest("hex")
        debug.expected_v2 = createHash("md5")
          .update(
            `${trans}-${user}-${paramsObj.amount_usd || ""}-${paramsObj.currency || "USD"}-${secret}`,
          )
          .digest("hex")
      }
      console.warn(`[Postback] Invalid signature for ${provider} from IP: ${requestIP}`, debug)
      // c.cx.ua's own docs respond with this exact plain-text convention on
      // signature mismatch. It will (correctly) be marked Failed in their
      // dashboard, but the readable body makes the root cause obvious there
      // instead of an opaque JSON blob.
      if (provider === "ccxua") {
        return new NextResponse("ERROR: Signature doesn't match", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        })
      }
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    // Parse parameters
    const postbackParams = parsePostbackParams(provider, searchParams)
    if (!postbackParams || !postbackParams.userId || !postbackParams.transactionId) {
      console.warn(`[Postback] Missing parameters for ${provider}:`, {
        hasUserId: !!postbackParams?.userId,
        hasTransactionId: !!postbackParams?.transactionId,
        rawParams: paramsObj,
      })
      // Same retry-avoidance rationale as below: for providers that
      // expect plain-text OK and retry on non-2xx, ack the test postback.
      const okText = PROVIDER_OK_RESPONSE[provider]
      if (okText) {
        return new NextResponse(okText, { status: 200, headers: { "Content-Type": "text/plain" } })
      }
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // CPX Research sends status=2 when a completed offer is later detected as
    // fraud (typically 15-60 days after completion). Reverse the original
    // conversion atomically via reverse_offerwall_conversion (deducts balance,
    // writes ledger, idempotent on repeat calls) so the user's balance matches
    // what CPX will actually pay out.
    if (provider === "cpx-research" && searchParams.get("status") === "2") {
      const txId = postbackParams.transactionId.replace(/^rev_/, "")
      console.warn(
        `[Postback] cpx-research reversal received - user: ${postbackParams.userId}, tx: ${txId}`,
      )
      try {
        const { data: reverseResult, error: reverseError } = await supabaseAdmin.rpc(
          "reverse_offerwall_conversion",
          { p_transaction_id: txId, p_reason: "CPX Research fraud detection (status=2)" },
        )
        if (reverseError) {
          console.error("[Postback] cpx-research reversal RPC error:", reverseError)
        } else {
          console.log("[Postback] cpx-research reversal result:", reverseResult)
        }
      } catch (revErr) {
        console.error("[Postback] cpx-research reversal error:", revErr)
      }
      // Always ack so CPX doesn't retry; outcome is recorded either way.
      return NextResponse.json({ ok: true })
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
      console.error(
        `[Postback] Provider "${provider}" missing from offerwall_providers table. ` +
          `Run the seed script (scripts/095_ccxua_and_provider_seeds.sql).`,
      )
      // For providers that retry on non-2xx (c.cx.ua retries 5x), return
      // their expected plain-text ack ("ok" for c.cx.ua per the official
      // S2S docs) so they don't keep hammering the endpoint. The error
      // is still logged loudly above for the operator to fix.
      const okText = PROVIDER_OK_RESPONSE[provider]
      if (okText) {
        return new NextResponse(okText, { status: 200, headers: { "Content-Type": "text/plain" } })
      }
      return NextResponse.json({ error: "Provider not found" }, { status: 404 })
    }

    // Calculate satoshi payout. Use Math.round (not floor) so micro-PTC
    // payouts that produce fractional sats (e.g. 0.5) credit 1 sat instead
    // of 0. Any positive reward is guaranteed at least 1 sat so c.cx.ua's
    // tiny $0.000250 PTC clicks never silently credit nothing.
    const rawSats = postbackParams.credits * (providerData.conversion_rate || 1)
    const payoutSatoshis =
      rawSats > 0 ? Math.max(1, Math.round(rawSats)) : Math.round(rawSats)

    // Verify user exists and get current balance
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, balance_satoshis, total_earned_satoshis")
      .eq("id", postbackParams.userId)
      .single()

    if (!profile) {
      console.warn(
        `[Postback] User "${postbackParams.userId}" not found for provider "${provider}". ` +
          `Likely a test postback or invalid subId.`,
      )
      // Acknowledge with the provider's expected ack token ("ok" for
      // c.cx.ua per the S2S docs) so the Test Postback button reports
      // success and the call isn't retried forever.
      const okText = PROVIDER_OK_RESPONSE[provider]
      if (okText) {
        return new NextResponse(okText, { status: 200, headers: { "Content-Type": "text/plain" } })
      }
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

    // Return success — providers expect different plain-text bodies.
    // c.cx.ua specifically requires lowercase "ok" (see top of file).
    // Default to "1" for the providers that follow the more common
    // generic offerwall convention.
    const okText = PROVIDER_OK_RESPONSE[provider] || "1"
    return new NextResponse(okText, { status: 200, headers: { "Content-Type": "text/plain" } })
  } catch (error) {
    console.error("[Postback] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET handler — used by:
//   • c.cx.ua's "Test Postback" button (always GET — see https://c.cx.ua/docs/)
//   • Browser-based debugging / manual testing
//   • Any provider that prefers query-string postbacks (the default)
//
// We hand straight through to handlePostback with the raw searchParams.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params
  const { searchParams } = new URL(request.url)
  return handlePostback(request, provider, searchParams)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler — used by providers that submit form-encoded or JSON bodies
// (CPX Research, some Lootably configurations, etc.). We merge body params
// into the URL's searchParams and dispatch to the SAME handler the GET path
// uses. We deliberately do NOT recreate a NextRequest here — copying the
// original headers (including Content-Length) onto a body-less replay caused
// the underlying fetch validator to reject the second pass, which is what
// surfaced as `ReferenceError: GET is not defined` in production logs and
// kept c.cx.ua's Test Postback button stuck on "Failed".
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params
  // Start from the URL's existing searchParams so providers can send mixed
  // query+body params and we keep both.
  const merged = new URLSearchParams(new URL(request.url).search)

  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase()

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text()
      const body = new URLSearchParams(text)
      body.forEach((value, key) => {
        if (!merged.has(key)) merged.set(key, value)
      })
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      form.forEach((value, key) => {
        if (typeof value === "string" && !merged.has(key)) {
          merged.set(key, value)
        }
      })
    } else if (contentType.includes("application/json")) {
      try {
        const json = await request.json()
        if (json && typeof json === "object") {
          Object.entries(json as Record<string, unknown>).forEach(([k, v]) => {
            if (!merged.has(k) && v != null) {
              merged.set(k, String(v))
            }
          })
        }
      } catch {
        // Ignore JSON parse failures — fall through with whatever we have.
      }
    }
  } catch (error) {
    console.error("[Postback POST] Body parsing failed:", error)
    // Fall through with whatever searchParams we managed to gather.
  }

  return handlePostback(request, provider, merged)
}
