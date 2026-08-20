import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("delivery daily-rollup RPC regression", () => {
  it("uses the named primary-key constraint inside serve_ad", () => {
    const path = resolve(process.cwd(), "scripts/078_ad_delivery_daily_fix.sql")
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, "utf8")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.serve_ad")
    expect(sql).toContain("ON CONFLICT ON CONSTRAINT ad_campaign_daily_pkey")
    expect(sql).not.toMatch(/ON CONFLICT\s*\(\s*campaign_id,\s*day\s*\)/)
  })
})
