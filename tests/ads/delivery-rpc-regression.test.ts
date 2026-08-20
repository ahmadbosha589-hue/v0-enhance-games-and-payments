import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("delivery RPC ambiguity regression", () => {
  it("adds a corrective migration for serve and click conflict handling", () => {
    const path = resolve(process.cwd(), "scripts/077_ad_delivery_rpc_fix.sql")
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, "utf8")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.serve_ad")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.record_ad_click")
    expect(sql).toContain("ON CONFLICT DO NOTHING")
    expect(sql).not.toMatch(/ON CONFLICT\s*\(\s*campaign_id,\s*viewer_hash/)
  })
})
