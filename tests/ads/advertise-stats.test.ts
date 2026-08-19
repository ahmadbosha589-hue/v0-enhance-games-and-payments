import { describe, expect, it } from "vitest"
import { summarizeAdDaily } from "@/lib/ads/advertise-stats"

describe("advertiser daily rollup summaries", () => {
  it("aggregates spend, delivery, CTR, viewability, and eCPM", () => {
    expect(summarizeAdDaily([
      { day: "2026-08-01", impressions: 1000, viewable: 800, clicks: 25, conversions: 2, spend: 2.5 },
      { day: "2026-08-02", impressions: 500, viewable: 400, clicks: 5, conversions: 1, spend: 1.25 },
    ])).toEqual({
      rows: [
        { day: "2026-08-01", impressions: 1000, viewable: 800, clicks: 25, conversions: 2, spend: 2.5 },
        { day: "2026-08-02", impressions: 500, viewable: 400, clicks: 5, conversions: 1, spend: 1.25 },
      ],
      totals: {
        impressions: 1500,
        viewable: 1200,
        clicks: 30,
        conversions: 3,
        spend: 3.75,
        ctr: 2,
        viewability: 80,
        ecpm: 2.5,
      },
    })
  })

  it("returns real zero metrics for an empty rollup", () => {
    expect(summarizeAdDaily([]).totals).toEqual({
      impressions: 0,
      viewable: 0,
      clicks: 0,
      conversions: 0,
      spend: 0,
      ctr: 0,
      viewability: 0,
      ecpm: 0,
    })
  })
})
