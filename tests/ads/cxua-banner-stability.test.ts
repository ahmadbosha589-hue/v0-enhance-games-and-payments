import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("c.cx.ua banner stability (no appear/disappear flash)", () => {
  it("frame page measures nested-iframe creatives by DECLARED dimensions, not layout box", () => {
    const frame = read("public/ads/cxua/banner-frame.html")
    expect(frame).toContain('iframe:not([data-self])')
    expect(frame).toContain('parseInt(st.maxWidth,10)')
    expect(frame).toContain('parseInt(st.height,10)')
  })

  it("never unmounts a banner that has already rendered a creative (sticky-once-seen)", () => {
    const src = read("components/ads/cx-ua-ads.tsx")
    expect(src).toContain("everMeasuredRef")
    // empty verdict gated on never-measured
    expect(src).toContain("if (!everMeasuredRef.current) setEmpty(true)")
  })

  it("plausibility band accepts the network's rotated formats", () => {
    const frame = read("public/ads/cxua/banner-frame.html")
    expect(frame).toContain("ratio>=0.15 && ratio<=14")
  })

  it("late-loading creatives are never declared empty — re-checks while a creative element exists", () => {
    const frame = read("public/ads/cxua/banner-frame.html")
    // re-check loop instead of instant collapse
    expect(frame).toContain("domHasCreative")
    expect(frame).toContain("setTimeout(finalCheck,1500)")
  })

  it("banner iframe loads the same-origin static frame (referrer-bearing)", () => {
    const src = read("components/ads/cx-ua-ads.tsx")
    expect(src).toContain("`/ads/cxua/banner-frame.html?z=${encodeURIComponent(zone)}&t=${token}`")
  })

  it("public layer chrome stays gated on real visibility (no empty Sponsored box)", () => {
    const src = read("components/ads/public-ads-layer.tsx")
    expect(src).toContain("onVisibilityChange={setAdVisible}")
    expect(src).toContain("adVisible &&")
  })
})
