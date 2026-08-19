import { describe, expect, it } from "vitest"
import { assertAdsenseAllowed, resolveAdZone } from "@/lib/ads/zones"

describe("ad zone separation", () => {
  it("keeps reward, auth, and admin paths out of AdSense", () => {
    expect(resolveAdZone("/dashboard")).toBe("incentivized")
    expect(resolveAdZone("/dashboard/claim")).toBe("incentivized")
    expect(resolveAdZone("/auth/login")).toBe("none")
    expect(resolveAdZone("/admin/ads")).toBe("none")
    expect(assertAdsenseAllowed("/dashboard/claim")).toBe(false)
    expect(assertAdsenseAllowed("/auth/login")).toBe(false)
  })

  it("allows only public non-reward routes", () => {
    expect(resolveAdZone("/")).toBe("adsense-eligible")
    expect(resolveAdZone("/blog/bitcoin-wallet-security")).toBe("adsense-eligible")
    expect(assertAdsenseAllowed("/about")).toBe(true)
  })
})
