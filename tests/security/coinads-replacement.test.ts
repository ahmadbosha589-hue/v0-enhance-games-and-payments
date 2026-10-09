import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("MellowAds (domain expired) is fully replaced by CoinAds", () => {
  const FILES = [
    "lib/config/ad-networks.ts",
    "lib/ads/registry.ts",
    "components/admin/ad-network-settings.tsx",
    "components/ads/multi-network-ads.tsx",
    "components/ads/ad-slot-multi-network.tsx",
    "components/ads/fullscreen-ad-modal.tsx",
    "components/support-us/support-us-content.tsx",
    "app/api/ads/config/route.ts",
    "app/admin/ads/page.tsx",
    "lib/adblock/detection-engine.ts",
  ]

  for (const file of FILES) {
    it(`${file} has no MellowAds remnants`, () => {
      expect(read(file)).not.toMatch(/mellowads|MellowAds|MELLOWADS/i)
    })
  }

  it("registry declares CoinAds (disabled until its exact tag is verified)", () => {
    const src = read("lib/ads/registry.ts")
    expect(src).toContain('id: "coinads"')
    expect(src).toContain('scriptOrigin: "https://coinads.io"')
    // stays disabled like every other unverified network
    const entry = src.slice(src.indexOf('id: "coinads"'), src.indexOf('id: "coinads"') + 400)
    expect(entry).toContain("enabled: false")
  })

  it("advertise (self-serve) config lists CoinAds with honest stats", () => {
    const src = read("lib/config/ad-networks.ts")
    expect(src).toContain('"coinads"')
    expect(src).toMatch(/name: "CoinAds"/)
    // The self-serve config schema has no website field; the network URL lives
    // in the registry + admin card, which carry their own assertions.
    expect(src).toMatch(/minBudget: 10/)
  })

  it("admin panel card for CoinAds exists with a zone field", () => {
    const src = read("components/admin/ad-network-settings.tsx")
    expect(src).toContain('id: "coinads"')
    expect(src).toContain("COINADS_ZONE_ID")
    expect(src).toContain("https://coinads.io")
  })

  it("public ads config defaults CoinAds from env", () => {
    const src = read("app/api/ads/config/route.ts")
    expect(src).toContain("coinads")
    expect(src).toContain("COINADS_ZONE_ID")
  })
})

describe("Support Us page shows the real ad inventory", () => {
  it("SupportUsContent renders live ad slots, not only status cards", () => {
    const src = read("components/support-us/support-us-content.tsx")
    // A-ADS is registry-enabled; its unit must actually render here.
    expect(src).toMatch(/AAdsAdaptiveUnit|acceptable\.a-ads\.com/)
  })

  it("configuration status cards belong to the admin panel only", () => {
    const src = read("components/support-us/support-us-content.tsx")
    // The 11-card 'Verified tag enabled / Awaiting …' grid duplicated admin
    // state on a user-facing page and read as broken placeholders.
    expect(src).not.toContain("Awaiting verified tag")
    expect(src).not.toMatch(/of \{AD_NETWORKS\.length\} verified/)
    expect(src).not.toMatch(/min-h-24 items-center/)
  })

  it("the ad inventory section renders before explanatory text, headed as real ads", () => {
    const src = read("components/support-us/support-us-content.tsx")
    expect(src).toMatch(/Partner advertising inventory|Watch and support/)
    const inventoryIdx = src.indexOf('id="support-partner-inventory"')
    expect(inventoryIdx).toBeGreaterThan(-1)
  })

  it("the support-us grid inventory renders real network tags via MultiNetworkAds", () => {
    const grid = read("components/ads/multi-network-ads.tsx")
    expect(grid).toContain("ad.a-ads.com")
    expect(grid).toContain("coinzillatag.com/lib/display.js")
    expect(grid).toContain("bitmedia.io/embed")
  })
})

describe("sticky A-ADS unit (dismissable, all non-admin pages)", () => {
  it("component renders the exact sticky markup with a dismiss control", () => {
    const src = read("components/ads/aads-sticky-unit.tsx")
    expect(src).toContain("2457981")
    expect(src).toContain("//acceptable.a-ads.com/2457981/?size=Adaptive")
    expect(src).toContain("aadssticky")
    expect(src).toContain("useAdConsent")
  })

  it("CSP allows the sticky unit's frame origin (already allowlisted)", () => {
    const policy = read("lib/security/csp-policy.mjs")
    expect(policy).toContain("https://acceptable.a-ads.com")
  })

  const STICKY_LAYOUTS = [
    "app/page.tsx",
    "app/(public)/layout.tsx",
    "app/dashboard/layout.tsx",
    "app/auth/layout.tsx",
    "app/l/layout.tsx",
    "app/not-found.tsx",
  ]

  for (const layout of STICKY_LAYOUTS) {
    it(`${layout} mounts the sticky unit`, () => {
      expect(read(layout)).toMatch(/AAdsStickyUnit/)
    })
  }

  it("admin panel stays free of the sticky unit", () => {
    expect(read("app/admin/layout.tsx")).not.toMatch(/AAdsStickyUnit/)
  })
})
