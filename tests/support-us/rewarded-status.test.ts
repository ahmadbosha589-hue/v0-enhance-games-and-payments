import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("support-us page rewarded-payout status", () => {
  it("derives rewarded-payout state from the shared config gate, not hardcoded copy", () => {
    const src = read("app/dashboard/support-us/page.tsx")
    expect(src).toContain("isRewardedAdsEnabled()")
    expect(src).toContain("rewardedEnabled ? \"Active\" : \"Not enabled\"")
    // no hardcoded availability claim may remain
    expect(src).not.toContain(">Unavailable<")
    expect(src).not.toContain("payouts are currently\n          unavailable")
  })

  it("alert copy is conditional on the gate", () => {
    const src = read("app/dashboard/support-us/page.tsx")
    expect(src).toContain('rewardedEnabled ?')
    expect(src).toContain("verified server-side")
  })
})
