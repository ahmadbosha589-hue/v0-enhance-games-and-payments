import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("earning and claim production contracts", () => {
  it("uses signed server watch sessions and atomic fulfillment for shortlinks", () => {
    expect(read("app/api/shortlinks/[id]/route.ts")).toContain("createWatchToken")
    expect(read("app/api/shortlinks/complete/route.ts")).toContain("verifyWatchToken")
    expect(read("app/api/shortlinks/complete/route.ts")).toContain("complete_shortlink_view")
    expect(read("app/dashboard/shortlinks/go/[id]/page.tsx")).toContain("watchToken")
  })

  it("uses signed server watch sessions and atomic fulfillment for PTC", () => {
    expect(read("app/api/ptc/[id]/route.ts")).toContain("createWatchToken")
    expect(read("app/api/ptc/complete/route.ts")).toContain("verifyWatchToken")
    expect(read("app/api/ptc/complete/route.ts")).toContain("complete_ptc_view")
    expect(read("app/dashboard/ptc/watch/[id]/page.tsx")).toContain("watchToken")
    expect(read("components/dashboard/ptc-ad-viewer.tsx")).toContain("watchToken")
    expect(read("app/api/ptc/status/route.ts")).toContain("requiredForFaucet: 3")
  })

  it("routes games and main faucet through atomic server fulfillment", () => {
    expect(read("app/api/games/complete/route.ts")).toContain("complete_game_reward")
    expect(read("app/api/claim/route.ts")).toContain("adminSupabase.rpc(\"atomic_claim\"")
    expect(read("app/api/claim/route.ts")).toContain("Claim service is temporarily unavailable")
  })

  it("enforces the PTC prerequisite on direct-faucet claims", () => {
    expect(read("app/api/manual-faucet/claim/route.ts")).toContain("completedPtcToday")
    expect(read("app/api/manual-faucet/claim/route.ts")).toContain("reserve_manual_faucet_claim")
    expect(read("app/api/manual-faucet/claim/route.ts")).toContain("finalize_manual_faucet_claim")
    expect(read("app/api/manual-faucet/claim/route.ts")).toContain("faucetpay_verified")
    expect(read("app/api/manual-faucet/claim/route.ts")).toContain("Complete 3 PTC ads today")
  })

  it("routes bonuses, coupons, achievements, and referrals through atomic server paths", () => {
    expect(read("app/api/daily-bonus/route.ts")).toContain("complete_daily_bonus")
    expect(read("app/api/coupons/redeem/route.ts")).toContain("redeem_coupon_atomic")
    expect(read("app/api/achievements/claim/route.ts")).toContain("claim_achievement_atomic")
    expect(read("app/api/referrals/process/route.ts")).toContain("process_referral_commission")
  })

  it("ships forward migrations for reward fulfillment and RPC ACLs", () => {
    expect(read("scripts/084_reward_atomic_fulfillment.sql")).toContain("complete_shortlink_view")
    expect(read("scripts/084_reward_atomic_fulfillment.sql")).toContain("complete_ptc_view")
    expect(read("scripts/084_reward_atomic_fulfillment.sql")).toContain("complete_game_reward")
    expect(read("scripts/085_reward_rpc_acl.sql")).toContain("REVOKE ALL ON FUNCTION")
    expect(read("scripts/086_atomic_bonus_coupon_achievement_referral.sql")).toContain("complete_daily_bonus")
    expect(read("scripts/086_atomic_bonus_coupon_achievement_referral.sql")).toContain("redeem_coupon_atomic")
    expect(read("scripts/086_atomic_bonus_coupon_achievement_referral.sql")).toContain("claim_achievement_atomic")
    expect(read("scripts/087_manual_faucet_reservation.sql")).toContain("reserve_manual_faucet_claim")
    expect(read("scripts/087_manual_faucet_reservation.sql")).toContain("finalize_manual_faucet_claim")
    expect(read("scripts/088_reward_view_duplicate_cleanup.sql")).toContain("ROW_NUMBER()")
    expect(read("scripts/089_game_cooldown_atomicity.sql")).toContain("idx_game_sessions_one_in_progress_per_type")
  })
})
