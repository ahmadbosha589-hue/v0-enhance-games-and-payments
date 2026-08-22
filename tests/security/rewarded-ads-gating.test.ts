import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

function walk(dir: string, ext: string[], out: string[] = []): string[] {
  for (const name of readdirSync(resolve(process.cwd(), dir))) {
    if (name === "node_modules" || name === ".next") continue
    const full = resolve(process.cwd(), dir, name)
    if (statSync(full).isDirectory()) walk(dir + "/" + name, ext, out)
    else if (ext.some((e) => name.endsWith(e))) out.push(dir + "/" + name)
  }
  return out
}

describe("rewarded-ads gating is config-driven (no hardcoded off-switches)", () => {
  it("no route or component keeps the hardcoded REWARDED_BONUS_ENABLED=false flag", () => {
    const files = [...walk("app/api", [".ts"]), ...walk("components", [".tsx"])]
    const offenders = files.filter((f) => read(f).includes("REWARDED_BONUS_ENABLED"))
    expect(offenders, `hardcoded flags remain in: ${offenders.join(", ")}`).toEqual([])
  })

  it("claim routes use the shared config gate", () => {
    for (const f of [
      "app/api/bonus-reward/claim/route.ts",
      "app/api/claim/double/route.ts",
      "app/api/claim/double-reward/route.ts",
      "app/api/daily-bonus/double/route.ts",
      "app/api/manual-faucet/double-reward/route.ts",
    ]) {
      expect(read(f)).toContain("isRewardedAdsEnabled()")
    }
  })

  it("the upsell component renders nothing when rewarded ads are not configured", () => {
    const src = read("components/ads/watch-ad-bonus-reward.tsx")
    // The shortlinks/PTC/coupons pages embed this component; with the feature
    // unconfigured it must render null — no PTC-style upsell on those pages.
    expect(src).toContain("isRewardedAdsEnabledClient()")
    expect(src).toMatch(/return null/)
  })

  it("enablement requires provider + secret + explicit opt-in flag", () => {
    const gate = read("lib/rewards/rewarded-ads.ts")
    expect(gate).toContain("REWARDED_ADS_PROVIDER")
    expect(gate).toContain("REWARDED_ADS_SECRET")
    expect(gate).toContain("NEXT_PUBLIC_REWARDED_ADS_ENABLED")
  })
})
