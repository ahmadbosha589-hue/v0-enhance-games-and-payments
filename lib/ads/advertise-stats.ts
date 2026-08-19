export interface AdDailyRow {
  day: string
  impressions: number
  viewable: number
  clicks: number
  conversions: number
  spend: number
}

export interface AdDailySummary {
  rows: AdDailyRow[]
  totals: {
    impressions: number
    viewable: number
    clicks: number
    conversions: number
    spend: number
    ctr: number
    viewability: number
    ecpm: number
  }
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

export function summarizeAdDaily(input: Array<Partial<AdDailyRow>>): AdDailySummary {
  const rows = input.map((row) => ({
    day: String(row.day || ""),
    impressions: Math.max(0, finiteNumber(row.impressions)),
    viewable: Math.max(0, finiteNumber(row.viewable)),
    clicks: Math.max(0, finiteNumber(row.clicks)),
    conversions: Math.max(0, finiteNumber(row.conversions)),
    spend: Math.max(0, finiteNumber(row.spend)),
  }))

  const totals = rows.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    viewable: sum.viewable + row.viewable,
    clicks: sum.clicks + row.clicks,
    conversions: sum.conversions + row.conversions,
    spend: sum.spend + row.spend,
  }), { impressions: 0, viewable: 0, clicks: 0, conversions: 0, spend: 0 })

  return {
    rows,
    totals: {
      ...totals,
      spend: Number(totals.spend.toFixed(6)),
      ctr: totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(4)) : 0,
      viewability: totals.impressions > 0 ? Number(((totals.viewable / totals.impressions) * 100).toFixed(4)) : 0,
      ecpm: totals.impressions > 0 ? Number(((totals.spend / totals.impressions) * 1000).toFixed(6)) : 0,
    },
  }
}
