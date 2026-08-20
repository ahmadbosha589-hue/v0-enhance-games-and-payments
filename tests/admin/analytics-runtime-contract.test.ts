import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("analytics runtime contracts", () => {
  it("uses the live claims amount column and numeric adblock normalization", () => {
    const page = read("app/admin/analytics/page.tsx")
    const route = read("app/api/admin/analytics-data/route.ts")

    expect(page).toContain("Number(data.detection_rate")
    expect(route).toContain('select("amount_satoshis, user_id"')
    expect(route).not.toContain('select("amount, user_id"')
  })
})
