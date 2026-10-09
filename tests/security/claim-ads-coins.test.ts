import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("claim page surfaces the operator-fixable cause, not user blame", () => {
  it("429 responses distinguish 'server rate limiter unavailable' from 'user spamming'", () => {
    const page = read("app/dashboard/manual-faucet/page.tsx")
    // The claim API returns 503 + RATE_LIMITER_UNAVAILABLE when the limiter
    // backend is missing; the page's 503 mapping must say it is a server-side
    // issue, NOT tell the user to slow down.
    expect(page).toMatch(/503: "Claims are temporarily unavailable on the server side/)
    expect(page).toContain("this is not caused by your activity")
  })

  it("claim API reports limiter-unavailable distinctly from user rate limiting", () => {
    const route = read("app/api/claim/route.ts")
    expect(route).toContain("RATE_LIMITER_UNAVAILABLE")
    expect(route).not.toMatch(/isWarning.*"Too many requests"/)
  })
})

describe("page ads render stacked with visible separation", () => {
  it("adaptive A-ADS unit reserves vertical space and bottom margin", () => {
    const src = read("components/ads/aads-adaptive-unit.tsx")
    expect(src).toMatch(/marginBottom|margin-bottom|my-2/)
  })

  it("Adsterra banner wrapper reserves space and margin from other units", () => {
    const src = read("components/ads/adsterra-units.tsx")
    expect(src).toMatch(/min-height:90px/)
    expect(src).toMatch(/margin:8px auto/)
  })

  it("page layouts separate the ad blocks from page content", () => {
    for (const layout of ["app/(public)/layout.tsx", "app/dashboard/layout.tsx", "app/l/layout.tsx"]) {
      const src = read(layout)
      expect(src).toMatch(/mt-4|space-y|pb-/)
    }
  })
})

describe("Coinzilla site-verification meta tag", () => {
  it("root layout head carries the exact coinzilla meta", () => {
    const src = read("app/layout.tsx")
    expect(src).toContain('<meta name="coinzilla" content="cb82a2d3ed6346ccdaba2d282d91003d" />')
  })
})
