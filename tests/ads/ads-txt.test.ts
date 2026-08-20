import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("ads.txt publisher declaration", () => {
  it("contains the supplied Google seller line", () => {
    const adsTxt = readFileSync(resolve(process.cwd(), "public/ads.txt"), "utf8")
    expect(adsTxt).toContain("google.com, pub-7529947159464197, DIRECT, f08c47fec0942fa0")
  })
})
