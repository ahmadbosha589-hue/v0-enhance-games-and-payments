import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Tournament-score plumbing contract.
 *
 * Tournaments score: faucet claims (claim route + offerwall postbacks +
 * adsgram already call update_tournament_score). Games, PTC, shortlinks,
 * manual faucet, and coupons never did — their tournaments silently never
 * scored. Every earning surface must feed the scorer after a successful
 * reward.
 */
const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const SURFACES: Array<[string, string]> = [
  ["app/api/games/complete/route.ts", "recordTournamentEarning"],
  ["app/api/ptc/complete/route.ts", "recordTournamentEarning"],
  ["app/api/shortlinks/complete/route.ts", "recordTournamentEarning"],
  ["app/api/manual-faucet/claim/route.ts", "recordTournamentEarning"],
  ["app/api/coupons/redeem/route.ts", "recordTournamentEarning"],
]

describe("every earning surface feeds tournament scoring", () => {
  for (const [route, rpcName] of SURFACES) {
    it(`${route} calls ${rpcName} after a successful reward`, () => {
      expect(read(route), `${route} must call ${rpcName}`).toContain(rpcName)
    })
  }

  it("shares one helper instead of five inline copies", () => {
    expect(read("lib/rewards/tournament-score.ts")).toContain(
      "export async function recordTournamentEarning",
    )
  })

  it("the helper uses the 061 RPC signature (p_user_id/p_category/p_period/p_score_delta)", () => {
    const helper = read("lib/rewards/tournament-score.ts")
    for (const param of ["p_user_id", "p_category", "p_period", "p_score_delta"]) {
      expect(helper, `helper must pass ${param}`).toContain(param)
    }
  })
})
