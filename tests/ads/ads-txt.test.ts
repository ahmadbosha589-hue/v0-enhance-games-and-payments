import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("ads.txt publisher declaration", () => {
  it("is fail-closed while no ad network is verified", () => {
    const adsTxt = readFileSync(resolve(process.cwd(), "public/ads.txt"), "utf8")
    // No seller lines may be declared until a network is verified and enabled
    // in the admin panel — the standing no-fake-ads rule.
    expect(adsTxt).not.toMatch(/DIRECT/)
  })
})
