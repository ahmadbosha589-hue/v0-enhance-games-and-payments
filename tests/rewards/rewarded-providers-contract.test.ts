import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("rewarded-ads provider integration (contract)", () => {
  it("S2S callback verifies signatures and never credits unverified events", () => {
    const src = read("app/api/ads/rewarded-callback/route.ts")
    expect(src).toContain("normalizeRewardedCallback")
    expect(src).toContain("createWatchToken")
    expect(src).toContain("isRewardedAdsEnabled()")
    expect(src).toContain("rewarded_ad_events")
  })

  it("provider adapters verify HMAC/shared secrets with timing-safe comparison", () => {
    const src = read("lib/rewards/rewarded-providers.ts")
    expect(src).toContain("timingSafeEqual")
    expect(src).toContain("BAD_SIGNATURE")
    expect(src).toContain("BAD_SECRET")
    expect(src).toContain("configuredRewardedNetworks")
    // all five networks supported
    for (const n of ["adsterra", "propellerads", "hilltopads", "adgem", "generic"]) {
      expect(src).toContain(`"${n}"`)
    }
  })

  it("bonus-reward claim requires a verified watch token — client amounts are never trusted", () => {
    const src = read("app/api/bonus-reward/claim/route.ts")
    expect(src).toContain("verifyWatchToken")
    expect(src).toContain('kind: "rewarded-ad"')
    expect(src).toContain("BONUS_RULES")
    // old client-trusted body fields must be gone (comment mentions are fine)
    expect(src).not.toContain("const { type, baseAmount")
    expect(src).toContain("watchToken")
    // atomic credit via safe_add_balance with idempotency
    expect(src).toContain("safe_add_balance")
    expect(src).toContain("idempotencyKey")
  })

  it("claim marks the provider event claimed atomically (no double-claim)", () => {
    const src = read("app/api/bonus-reward/claim/route.ts")
    expect(src).toContain('.is("claimed_at", null)')
    expect(src).toContain("already claimed")
  })

  it("migration 107 creates the idempotent event ledger", () => {
    const sql = read("scripts/107_rewarded_ad_events.sql")
    expect(sql).toContain("rewarded_ad_events")
    expect(sql).toContain("idx_rewarded_ad_events_txid")
    expect(sql).toContain("claimed_at")
  })

  it("RewardedAdUnit never unlocks on client timers alone — polls for provider-verified token", () => {
    const src = read("components/ads/rewarded-ad-unit.tsx")
    expect(src).toContain("rewarded-session")
    expect(src).toContain("onVerified")
    // completion always hands the verified token to the parent
    expect(src).toMatch(/setPhase\("done"\)\s*\n\s*onVerified/)
  })

  it("WatchAdBonusReward claims with watchToken — no client-computed amounts in body", () => {
    const src = read("components/ads/watch-ad-bonus-reward.tsx")
    expect(src).toContain("RewardedAdUnit")
    expect(src).toContain("watchToken: verifiedTokens[0]")
    expect(src).not.toContain("baseAmount,\n          multiplier")
  })

  it("support-us claim/double are gated and verify tokens", () => {
    for (const f of ["app/api/support-us/claim/route.ts", "app/api/support-us/double/route.ts"]) {
      const src = read(f)
      expect(src).toContain("isRewardedAdsEnabled()")
      expect(src).toContain("verifyWatchToken")
      expect(src).not.toContain("SUPPORT_REWARDED_ADS_ENABLED = false")
    }
  })

  it("advertise page + API expose the same 9 real self-serve networks", () => {
    const page = read("app/dashboard/advertise/page.tsx")
    const api = read("app/api/advertise/route.ts")
    const config = read("lib/config/ad-networks.ts")
    const expected = ["adsterra", "propellerads", "hilltopads", "coinzilla", "bitmedia", "a-ads", "cointraffic", "trafficstars", "coinads"]
    // Both surfaces must import the SHARED single source of truth (the ids are
    // declared exactly once in lib/config/ad-networks.ts — neither file may
    // keep a local copy that can drift again).
    expect(page).toContain('from "@/lib/config/ad-networks"')
    expect(api).toContain('from "@/lib/config/ad-networks"')
    for (const id of expected) {
      expect(config).toContain(`"${id}"`)
    }
    // fictional networks gone
    for (const fake of ["google-ads", "facebook-ads", "tiktok-ads", "twitter-ads"]) {
      expect(page).not.toContain(`"${fake}": {`)
      expect(api).not.toContain(`"${fake}"`)
      expect(config).not.toContain(`"${fake}": {`)
    }
  })
})
