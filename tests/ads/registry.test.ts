import { describe, expect, it } from "vitest"
import { AD_NETWORKS, adFrameOrigins, adScriptOrigins, enabledNetworks, getNetwork, isNetworkRenderable } from "@/lib/ads/registry"

describe("publisher ad registry", () => {
  it("has a unique id and at least one required field per network", () => {
    const ids = AD_NETWORKS.map((network) => network.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const network of AD_NETWORKS) {
      expect(network.fields.some((field) => field.required)).toBe(true)
      expect(network.sizes.length).toBeGreaterThan(0)
      expect(network.tagKind).toBeTruthy()
    }
  })

  it("requires an explicit reason for every disabled network", () => {
    for (const network of AD_NETWORKS) {
      if (!network.enabled) expect(network.disabledReason?.length).toBeGreaterThan(0)
    }
  })

  it("renders exactly the four tag-verified networks and gates the rest", () => {
    const renderableIds = enabledNetworks().map((network) => network.id).sort()
    expect(renderableIds).toEqual(["a-ads", "adsterra", "bitmedia", "coinzilla"])
    expect(isNetworkRenderable("a-ads")).toBe(true)
    expect(isNetworkRenderable("coinzilla")).toBe(true)
    expect(isNetworkRenderable("bitmedia")).toBe(true)
    expect(isNetworkRenderable("adsterra")).toBe(true)
    // Unverified tags stay non-renderable no matter what credentials exist.
    for (const id of ["google", "cointraffic", "medianet", "hilltopads", "propellerads", "trafficstars", "coinads", "adskeeper"]) {
      expect(isNetworkRenderable(id), `${id} must not be renderable yet`).toBe(false)
    }
    expect(getNetwork("does-not-exist")).toBeUndefined()
  })

  it("exposes the verified networks' script and frame origins for CSP", () => {
    const scripts = adScriptOrigins()
    expect(scripts).toContain("https://a-ads.com")
    expect(scripts).toContain("https://coinzillatag.com")
    // bitmedia renders via iframe; its frame origin must be exposed.
    expect(adFrameOrigins()).toContain("https://bitmedia.io")
  })
})
