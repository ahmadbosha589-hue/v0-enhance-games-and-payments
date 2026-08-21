import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("admin RSC resilience", () => {
  it("does not use the ten-second admin render timeout", () => {
    expect(read("app/admin/layout.tsx")).toContain("export const maxDuration = 30")
    expect(read("app/admin/page.tsx")).toContain("export const maxDuration = 30")
  })

  it("bounds the server-side adblock query so it cannot terminate the RSC stream", () => {
    const page = read("app/admin/page.tsx")
    expect(page).toContain("Promise.race")
    expect(page).toContain("Adblock stats timeout")
  })
})
