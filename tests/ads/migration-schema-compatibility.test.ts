import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const sql = (name: string) => readFileSync(resolve(process.cwd(), "scripts", name), "utf8")

describe("first-party delivery migration schema isolation", () => {
  it("uses isolated delivery tables instead of legacy ad tables", () => {
    const delivery = sql("073_ad_delivery.sql")
    const rpc = sql("074_ad_serve_rpc.sql")

    expect(delivery).toContain("public.ad_delivery_impressions")
    expect(delivery).toContain("public.ad_delivery_clicks")
    expect(rpc).toContain("public.ad_delivery_impressions")
    expect(rpc).toContain("public.ad_delivery_clicks")
    expect(rpc).not.toMatch(/public\.ad_impressions\b/)
    expect(rpc).not.toMatch(/public\.ad_clicks\b/)
  })
})
