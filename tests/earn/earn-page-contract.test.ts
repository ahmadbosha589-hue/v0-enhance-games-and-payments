import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("All Earning Options page is complete and honest", () => {
  const page = () => read("app/dashboard/earn/page.tsx")

  it("includes Boosters (missing today)", () => {
    expect(page()).toContain("/dashboard/boosters")
  })

  it("does not hardcode reward ranges that the live config can contradict", () => {
    // Rewards must derive from lib/earn/availability.ts (config-driven), not
    // invented literals.
    expect(page()).toContain("earningAvailability")
    expect(page()).not.toMatch(/"100-10,000\+ sats"/)
    expect(page()).not.toMatch(/"Up to 30,000 sats"/)
    expect(page()).not.toMatch(/"1-5 sats\/link"/)
  })

  it("renders live availability per card (Available / Setup Required)", () => {
    expect(page()).toMatch(/available|unavailable/i)
    expect(page()).toMatch(/reason/)
  })

  it("lists every earning surface the dashboard ships", () => {
    for (const href of [
      "/dashboard/claim",
      "/dashboard/manual-faucet",
      "/dashboard/games",
      "/dashboard/coupons",
      "/dashboard/shortlinks",
      "/dashboard/offerwalls",
      "/dashboard/ptc",
      "/dashboard/achievements",
      "/dashboard/tournaments",
      "/dashboard/boosters",
      "/dashboard/support-us",
      "/dashboard/referrals",
    ]) {
      expect(page(), `missing ${href}`).toContain(`"${href}"`)
    }
  })
})

describe("earn availability helper exists and is config-driven", () => {
  it("exports earningAvailability with per-option availability + honest reward text", () => {
    const helper = read("lib/earn/availability.ts")
    expect(helper).toContain("export function earningAvailability")
    expect(helper).toContain("rewardText")
    expect(helper).toContain("reason")
  })

  it("derives availability from live config inputs, not hardcoded flags", () => {
    const helper = read("lib/earn/availability.ts")
    expect(helper).toContain("redisConfigured")
    expect(helper).toContain("rewardedAdsEnabled")
    expect(helper).toContain("offerwallsConfigured")
  })
})
