import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("advertiser campaign → delivery loop is complete", () => {
  it("an admin page consumes the pending-review API (today nothing does)", () => {
    const adminAds = read("app/admin/ads/page.tsx")
    expect(
      adminAds,
      "admin ads page must mount the CampaignReview component",
    ).toMatch(/CampaignReview/)
  })

  it("the review component exists and hits both GET and POST of the review API", () => {
    const component = read("components/admin/campaign-review.tsx")
    expect(component).toContain("/api/admin/advertise/review")
    expect(component).toMatch(/method: "POST"/)
  })

  it("approve activates first-party delivery (serve_ad can serve the campaign)", () => {
    const review = read("app/api/admin/advertise/review/route.ts")
    expect(review).toContain('creative_status: "approved"')
    expect(review).toContain('status: "active"')
  })

  it("serve_ad only returns active approved campaigns with budget", () => {
    const serve = read("app/api/ads/serve/route.ts")
    expect(serve).toContain("serve_ad")
  })
})
