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

  it("does not expose unverified vendors as renderable", () => {
    expect(enabledNetworks()).toEqual([])
    expect(adScriptOrigins()).toEqual([])
    expect(adFrameOrigins()).toEqual([])
    expect(isNetworkRenderable("bitmedia")).toBe(false)
    expect(getNetwork("does-not-exist")).toBeUndefined()
  })
})
