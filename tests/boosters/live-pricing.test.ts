import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("live-rate booster pricing (contract)", () => {
  it("boosters GET recomputes satoshi prices at the live BTC/USD rate and refuses stale rates", () => {
    const src = read("app/api/boosters/route.ts")
    expect(src).toContain("usdToSatoshis")
    expect(src).toContain("RATE_UNAVAILABLE")
    // GET must overwrite the stale snapshot per tier
    expect(src).toContain("t.price_satoshis = Math.floor((Number(t.price_usd) / first.btcUsd) * 100_000_000)")
    expect(src).toContain("pricing: pricingMeta")
  })

  it("faucetpay purchase charges the live-rate amount, not the DB snapshot", () => {
    const src = read("app/api/boosters/route.ts")
    expect(src).toContain(
      "const requiredSatoshis = Math.floor((Number(tierData.price_usd) / liveRate) * 100_000_000)",
    )
    expect(src).toContain("purchase_booster_with_balance_at_price")
    expect(src).not.toContain('"purchase_booster_with_balance",')
    expect(src).toContain("p_price_satoshis: requiredSatoshis")
  })

  it("migration 108 provides the explicit-price purchase RPC locked to service_role", () => {
    const sql = read("scripts/108_booster_live_pricing.sql")
    expect(sql).toContain("purchase_booster_with_balance_at_price")
    expect(sql).toContain("COALESCE(p_price_satoshis, v_tier.price_satoshis)")
    expect(sql).toContain("'live_rate'")
    expect(sql).toContain("TO service_role")
  })

  it("pricing module has no synthetic fallback — refuses when the live rate fails", () => {
    const src = read("lib/pricing/crypto-rates.ts")
    expect(src).toContain("api.coingecko.com")
    expect(src).not.toMatch(/FALLBACK|fallbackPrice|DEFAULT_PRICE\s*=/)
    expect(src).toContain("Math.floor") // round down: never overcharge
  })

  it("UI presents BTC amounts with a live-rate disclaimer instead of raw stale sats", () => {
    const src = read("components/boosters/boosters-content.tsx")
    expect(src).toContain("Live-rate pricing")
    expect(src).toContain("at live rate")
    expect(src).toContain("toFixed(8)} BTC")
  })
})
