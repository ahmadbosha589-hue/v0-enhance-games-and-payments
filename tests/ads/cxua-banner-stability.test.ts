import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("c.cx.ua banner stability (no appear/disappear flash)", () => {
  it("measures nested-iframe creatives by their DECLARED dimensions, not layout box", () => {
    const src = read("components/ads/cx-ua-ads.tsx")
    expect(src).toContain('querySelector("iframe:not([data-self])")')
    expect(src).toContain("parseInt(st.maxWidth,10)")
    expect(src).toContain("parseInt(st.height,10)")
  })

  it("never unmounts a banner that has already rendered a creative (sticky-once-seen)", () => {
    const src = read("components/ads/cx-ua-ads.tsx")
    expect(src).toContain("everMeasuredRef")
    // empty verdict gated on never-measured
    expect(src).toContain("if (!everMeasuredRef.current) setEmpty(true)")
  })

  it("plausibility band accepts the network's rotated formats", () => {
    const src = read("components/ads/cx-ua-ads.tsx")
    expect(src).toContain("ratio>=0.15 && ratio<=14")
  })

  it("public layer chrome stays gated on real visibility (no empty Sponsored box)", () => {
    const src = read("components/ads/public-ads-layer.tsx")
    expect(src).toContain("onVisibilityChange={setAdVisible}")
    expect(src).toContain("adVisible &&")
  })
})
