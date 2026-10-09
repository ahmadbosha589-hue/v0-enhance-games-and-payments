import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCspPolicy } from "@/lib/security/csp-policy.mjs"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const policy = buildCspPolicy()
const frameSrc = policy.match(/(?:^|; )frame-src ([^;]+)/)?.[1] ?? ""

describe("A-Ads adaptive unit 2457981 renders on every non-admin page", () => {
  it("allows the acceptable.a-ads.com iframe origin in frame-src", () => {
    expect(frameSrc).toContain("https://acceptable.a-ads.com")
  })

  it("component renders the exact A-Ads unit markup (unit id, src, sizing)", () => {
    const src = read("components/ads/aads-adaptive-unit.tsx")
    expect(src).toContain(`data-aa="2457981"`)
    expect(src).toContain(`//acceptable.a-ads.com/2457981/?size=Adaptive`)
    expect(src).toContain("useAdConsent")
  })

  const MOUNTING_LAYOUTS = [
    "app/page.tsx",
    "app/(public)/layout.tsx",
    "app/dashboard/layout.tsx",
    "app/auth/layout.tsx",
    "app/l/layout.tsx",
    "app/not-found.tsx",
  ]

  for (const layout of MOUNTING_LAYOUTS) {
    it(`${layout} mounts the A-Ads adaptive unit`, () => {
      expect(read(layout)).toMatch(/AAdsAdaptiveUnit/)
    })
  }

  it("admin panel stays ad-free (no A-Ads unit in admin layout)", () => {
    expect(read("app/admin/layout.tsx")).not.toMatch(/AAdsAdaptiveUnit/)
  })
})
