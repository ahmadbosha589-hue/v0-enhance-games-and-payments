import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("advertiser campaign creation migration", () => {
  it("defines a locked, single-transaction campaign creation RPC", () => {
    const sql = readFileSync(resolve(process.cwd(), "scripts/075_ad_balance_atomic.sql"), "utf8")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_ad_campaign")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("INSERT INTO public.ad_campaigns")
    expect(sql).toContain("INSERT INTO public.ad_transactions")
    expect(sql).toContain("UPDATE public.profiles")
  })
})
