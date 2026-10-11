import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

/**
 * Only /api/claim gated on the adblock flag; the other five earning surfaces
 * paid flagged users — including PTC, which pays specifically for viewing
 * the ads the user is blocking. Every reward surface must enforce the flag
 * BEFORE crediting.
 */
const UNGATED = [
  ["app/api/ptc/complete/route.ts", "PTC"],
  ["app/api/shortlinks/complete/route.ts", "Shortlinks"],
  ["app/api/games/complete/route.ts", "Games"],
  ["app/api/coupons/redeem/route.ts", "Coupons"],
  ["app/api/manual-faucet/claim/route.ts", "Manual faucet"],
]

describe("every earning surface enforces the adblock flag", () => {
  it.each(UNGATED)("%s returns 403 ADBLOCK_FLAGGED", (route, label) => {
    const src = read(route as string)
    expect(src, `${label} must gate on adblock_flagged`).toMatch(/adblock_flagged/)
    expect(src, `${label} must return the ADBLOCK_FLAGGED error code`).toContain(
      "ADBLOCK_FLAGGED",
    )
  })
})
