import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { AD_NETWORKS, getNetwork } from "@/lib/ads/registry"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("admin ad-network enable flow is real, not a facade", () => {
  it("registry enables exactly the three tag-verified legacy networks", () => {
    for (const id of ["a-ads", "coinzilla", "bitmedia"]) {
      const network = getNetwork(id)
      expect(network?.enabled, `${id} must be renderable`).toBe(true)
      expect(network?.disabledReason).toBeUndefined()
    }
  })

  it("keeps google and the other unverified networks disabled", () => {
    for (const id of [
      "google",
      "cointraffic",
      "medianet",
      "hilltopads",
      "adsterra",
      "propellerads",
      "trafficstars",
      "mellowads",
      "adskeeper",
    ]) {
      expect(getNetwork(id)?.enabled, `${id} must stay disabled until its tag is verified`).toBe(false)
    }
  })

  it("bitmedia registry entry describes the real iframe embed actually rendered", () => {
    const bitmedia = getNetwork("bitmedia")
    expect(bitmedia?.tagKind).toBe("iframe-src")
    expect(bitmedia?.scriptOrigin).toBe("https://bitmedia.io")
  })

  it("admin panel offers no Google AdSense card or rewarded-slot fields", () => {
    const src = read("components/admin/ad-network-settings.tsx")
    expect(src).not.toContain('"google_ads"')
    expect(src).not.toContain("GOOGLE_ADS_CLIENT_ID")
    expect(src).not.toContain("GOOGLE_ADS_SLOT_BANNER")
    expect(src).not.toContain("GOOGLE_ADS_SLOT_REWARDED")
  })

  it("admin cards show honest per-network render status from the registry", () => {
    const src = read("components/admin/ad-network-settings.tsx")
    expect(src).toContain("getNetwork")
    expect(src).toMatch(/Tag verification pending/)
    expect(src).toMatch(/Renders live/)
  })

  it("save toast tells the operator where and when the ad appears", () => {
    const src = read("components/admin/ad-network-settings.tsx")
    expect(src).toMatch(/~5 minutes|5 minutes/)
  })

  it("grid slots render real network tags, not empty placeholder boxes", () => {
    const src = read("components/ads/multi-network-ads.tsx")
    expect(src).toContain("ad.a-ads.com")
    expect(src).toContain("coinzillatag.com/lib/display.js")
    expect(src).toContain("bitmedia.io/embed")
  })

  it("rotating slot keeps the verified per-network render cases", () => {
    const src = read("components/ads/ad-slot-multi-network.tsx")
    expect(src).toContain("//ad.a-ads.com/")
    expect(src).toContain("coinzillatag.com/lib/display.js")
    expect(src).toContain("bitmedia.io/embed/")
  })

  it("config API bridges admin field keys to renderer keys and id aliases", () => {
    const src = read("app/api/ads/config/route.ts")
    expect(src).toContain('A_ADS_UNIT_ID: "publisherId"')
    expect(src).toContain('COINZILLA_ZONE_ID: "zoneId"')
    expect(src).toContain('BITMEDIA_ZONE_ID: "zoneId"')
    expect(src).toContain('a_ads: "a-ads"')
    // The registry render gate and the admin enable flag meet in the sanitizer.
    expect(src).toContain("isNetworkRenderable(key)")
  })

  it("admin ads page no longer advertises Google in counts or names", () => {
    const page = read("app/admin/ads/page.tsx")
    expect(page).not.toContain("google_ads")
    expect(page).not.toContain('"Google AdSense"')
    expect(page).not.toContain("12 Ad Networks")
    expect(page).not.toMatch(/const totalNetworks = 12/)
  })

  it("every registry network id maps to an admin card or is intentionally absent", () => {
    const adminSrc = read("components/admin/ad-network-settings.tsx")
    const alias: Record<string, string> = { "a-ads": "a_ads" }
    for (const network of AD_NETWORKS) {
      if (network.id === "google") continue // intentionally removed: policy
      expect(adminSrc).toContain(`id: "${alias[network.id] ?? network.id}"`)
    }
  })
})
