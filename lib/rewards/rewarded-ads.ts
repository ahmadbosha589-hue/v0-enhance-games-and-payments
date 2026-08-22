import { Redis } from "@upstash/redis"

// ═══════════════════════════════════════════════════════════════════════════════
// REWARDED-ADS ENABLEMENT (single source of truth)
//
// Rewarded bonuses ("watch 3 ads to double your reward") may only be offered
// when a REAL verified rewarded-ad provider is configured. Without one there is
// no ad inventory and no server-side proof of viewing, so the feature must not
// render at all — showing the upsell would funnel users into guaranteed-503
// claims, which is exactly the simulated-inventory pattern this codebase
// removed everywhere else.
//
// To enable: set ALL of these in the deployment environment…
//   REWARDED_ADS_PROVIDER      — e.g. "adgem" | "adsterra" (must match a
//                                provider wired in app/api/ads/rewarded-callback)
//   REWARDED_ADS_SECRET        — the provider's postback signing secret
//   NEXT_PUBLIC_REWARDED_ADS_ENABLED — "true" (explicit opt-in flag)
// …AND enable the matching network record in the admin ads panel.
// The client-side check mirrors only the env flags; the claim routes re-verify
// everything server-side before paying.
// ═══════════════════════════════════════════════════════════════════════════════

const _redis = process.env.KV_REST_API_URL ? new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN || "",
}) : null

void _redis // reserved for idempotency storage of reward callbacks

export function isRewardedAdsEnabled(): boolean {
  const provider = process.env.REWARDED_ADS_PROVIDER?.trim()
  const secret = process.env.REWARDED_ADS_SECRET?.trim()
  const flag = process.env.NEXT_PUBLIC_REWARDED_ADS_ENABLED?.trim().toLowerCase()
  return Boolean(provider) && Boolean(secret) && flag === "true"
}

/** Client-safe variant: only reads NEXT_PUBLIC flags (no server secrets). */
export function isRewardedAdsEnabledClient(): boolean {
  const provider = process.env.NEXT_PUBLIC_REWARDED_ADS_PROVIDER?.trim()
  const flag = process.env.NEXT_PUBLIC_REWARDED_ADS_ENABLED?.trim().toLowerCase()
  return Boolean(provider) && flag === "true"
}
