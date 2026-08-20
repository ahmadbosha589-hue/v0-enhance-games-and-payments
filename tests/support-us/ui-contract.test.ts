import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("Support Us UI contract", () => {
  it("renders a truthful 11-network support surface without Google rewarded-ad claims", () => {
    const page = read("app/dashboard/support-us/page.tsx")
    const content = read("components/support-us/support-us-content.tsx")

    expect(page).toContain("11 partner ad networks")
    expect(page).not.toContain("Earn Rewards")
    expect(page).not.toContain("$0.0001")
    expect(content).toContain("MultiNetworkAds")
    expect(content).toContain("AD_NETWORKS")
    expect(content).not.toContain("Google Rewarded")
    expect(content).not.toContain("SUPPORT_REWARDED_ADS_ENABLED = false")

    for (const route of [
      "app/dashboard/earn/page.tsx",
      "app/dashboard/manual-faucet/page.tsx",
      "components/dashboard/claim-interface.tsx",
      "components/dashboard/daily-bonus-button.tsx",
    ]) {
      const source = read(route)
      expect(source, route).not.toContain("Watch Ads to Double")
      expect(source, route).not.toContain("Google Rewarded")
    }
  })

  it("keeps reward payout endpoints fail-closed until watch proof is implemented", () => {
    expect(read("app/api/support-us/claim/route.ts")).toContain("status: 503")
    expect(read("app/api/support-us/double/route.ts")).toContain("status: 503")
  })
})
