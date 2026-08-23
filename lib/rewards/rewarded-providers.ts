import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Rewarded-ad provider S2S (server-to-server) postback adapters.
 *
 * Every supported network calls back to `/api/ads/rewarded-callback` when a
 * user completes a rewarded view. Each provider signs/identifies its callback
 * differently, so this module normalizes them into one shape:
 *
 *   { ok: true, txid, userId?, network }
 *
 * Security model
 * --------------
 *  - HMAC providers (generic + AdGem-style): signature over the raw query/body
 *    is verified with the per-network secret before anything else.
 *  - Parameter-carrying providers (Adsterra/PropellerAds/HilltopAds style
 *    postbacks): the shared secret is compared against a `secret`/`token`
 *    parameter with timingSafeEqual. The userId must be embedded in the
 *    callback's user parameter (we pass it as `{userId}:{txid}` when building
 *    the ad request server-side).
 *
 * A callback that fails verification returns ok:false and is NEVER credited.
 */

export type RewardedNetworkId =
  | "adsterra"
  | "propellerads"
  | "hilltopads"
  | "adgem"
  | "generic"

export interface NormalizedCallback {
  ok: boolean
  reason?: string
  /** Provider transaction id — used once for idempotent crediting. */
  txid?: string
  /** Platform user id if the provider echoes it back. */
  userId?: string
  /** Reward amount in the provider's currency, when reported. */
  amount?: number
  network?: RewardedNetworkId
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function getSecret(network: RewardedNetworkId): string {
  const map: Record<RewardedNetworkId, string> = {
    adsterra: "REWARDED_ADSTERRA_SECRET",
    propellerads: "REWARDED_PROPELLERADS_SECRET",
    hilltopads: "REWARDED_HILLTOPADS_SECRET",
    adgem: "REWARDED_ADGEM_SECRET",
    generic: "REWARDED_ADS_SECRET",
  }
  const secret = process.env[map[network]]?.trim()
  if (!secret) throw new Error(`No secret configured for rewarded network '${network}'`)
  return secret
}

/** Params from either the query string or an x-www-form-urlencoded body. */
export type CallbackParams = Record<string, string>

/**
 * Generic HMAC postback: `...&sig=<hmac_sha256(secret, sorted-query)>`.
 * Covers self-serve networks offering signed postbacks (e.g. via S2S config).
 */
function verifyGenericHmac(params: CallbackParams, network: RewardedNetworkId): NormalizedCallback {
  const received = params.sig || params.signature || params.hash || ""
  if (!received) return { ok: false, reason: "MISSING_SIGNATURE", network }

  const { sig: _s, signature: _sg, hash: _h, ...rest } = params
  const canonical = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&")

  const expected = createHmac("sha256", getSecret(network)).update(canonical).digest("hex")
  // Accept hex or base64url forms.
  const expectedB64 = createHmac("sha256", getSecret(network)).update(canonical).digest("base64url")
  if (!safeEqual(received.toLowerCase(), expected.toLowerCase()) && !safeEqual(received, expectedB64)) {
    return { ok: false, reason: "BAD_SIGNATURE", network }
  }

  return {
    ok: true,
    txid: params.txid || params.transaction_id || params.click_id || "",
    userId: params.user_id || params.uid || undefined,
    amount: params.amount ? Number(params.amount) : undefined,
    network,
  }
}

/** Shared-secret parameter postback (most common CPM-network style). */
function verifySharedSecret(params: CallbackParams, network: RewardedNetworkId): NormalizedCallback {
  const received = params.secret || params.token || params.key || ""
  if (!received) return { ok: false, reason: "MISSING_SECRET", network }
  if (!safeEqual(received, getSecret(network))) {
    return { ok: false, reason: "BAD_SECRET", network }
  }

  const txid = params.txid || params.transaction_id || params.imp_id || params.clickid || ""
  if (!txid) return { ok: false, reason: "MISSING_TXID", network }

  // Our ad units embed `{userId}:{nonce}` in the user/sub_id parameter.
  const userRaw = params.user_id || params.sub_id || params.subid || params.uid || ""
  const [userId] = userRaw.split(":")

  return {
    ok: true,
    txid,
    userId: userId || undefined,
    amount: params.amount ? Number(params.amount) : undefined,
    network,
  }
}

const SHARED_SECRET_NETWORKS: ReadonlySet<RewardedNetworkId> = new Set([
  "adsterra",
  "propellerads",
  "hilltopads",
])

/**
 * Normalize any supported provider's callback into a verified result.
 * `network` comes from the route path/query (`?network=adsterra`).
 */
export function normalizeRewardedCallback(
  network: string,
  params: CallbackParams,
): NormalizedCallback {
  const id = network.trim().toLowerCase() as RewardedNetworkId

  switch (id) {
    case "adgem":
      // AdGem signs callbacks with HMAC-SHA256 over sorted parameters.
      return verifyGenericHmac(params, "adgem")
    case "generic":
      return verifyGenericHmac(params, "generic")
    case "adsterra":
    case "propellerads":
    case "hilltopads":
      if (SHARED_SECRET_NETWORKS.has(id)) {
        return verifySharedSecret(params, id)
      }
      return verifyGenericHmac(params, id)
    default:
      return { ok: false, reason: "UNKNOWN_NETWORK" }
  }
}

/**
 * Which networks are configured (have secrets)? Only these are accepted by the
 * callback route and offered to the client renderer.
 */
export function configuredRewardedNetworks(): RewardedNetworkId[] {
  const out: RewardedNetworkId[] = []
  if (process.env.REWARDED_ADS_SECRET?.trim()) out.push("generic")
  if (process.env.REWARDED_ADSTERRA_SECRET?.trim()) out.push("adsterra")
  if (process.env.REWARDED_PROPELLERADS_SECRET?.trim()) out.push("propellerads")
  if (process.env.REWARDED_HILLTOPADS_SECRET?.trim()) out.push("hilltopads")
  if (process.env.REWARDED_ADGEM_SECRET?.trim()) out.push("adgem")
  return out
}
