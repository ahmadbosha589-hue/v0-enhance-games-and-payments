import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Earning-inventory seed contract.
 *
 * The migration runner (scripts/migrate.mjs:42-46) executes ONLY
 * scripts/migrations/000_migration_state.sql plus scripts/071-099_*.sql and
 * scripts/1xx_*.sql. Any inventory seeded in standalone files
 * (scripts/seed-*.sql) or pre-071 migrations never reaches a production
 * database migrated with the runner — which is exactly how production ended
 * up with zero PTC ads, shortlinks, coupons, achievement definitions, and
 * tournaments. These tests pin the inventory to TRACKED migrations.
 */
const scriptsDir = resolve(process.cwd(), "scripts")
const read = (f: string) =>
  readFileSync(resolve(scriptsDir, f), "utf8").replace(/\r\n/g, "\n")

const TRACKED = readdirSync(scriptsDir)
  .filter((f) => /^(?:0(?:7[1-9]|8[0-9]|9[0-9])|[1-9][0-9]{2,})_.*\.sql$/i.test(f))

function trackedSeed(table: string, minStatements: number): string | null {
  for (const f of TRACKED) {
    const src = read(f)
    const matches = src.match(
      new RegExp(`INSERT INTO (?:public\\.)?${table}\\b`, "gi"),
    )
    if (matches && matches.length >= minStatements) return f
  }
  return null
}

describe("earning inventory is seeded by TRACKED migrations", () => {
  it("seeds PTC ads (multiple price tiers)", () => {
    expect(trackedSeed("ptc_ads", 4)).toBeTruthy()
  })

  it("seeds shortlinks (multiple price tiers)", () => {
    expect(trackedSeed("shortlinks", 3)).toBeTruthy()
  })

  it("seeds coupons (multiple batches)", () => {
    expect(trackedSeed("coupons", 3)).toBeTruthy()
  })

  it("seeds achievement definitions with requirement types the engine reads", () => {
    const file = trackedSeed("achievements", 3)
    expect(file).toBeTruthy()
    if (file) {
      const src = read(file)
      // app/api/achievements/check/route.ts switches on exactly these values.
      for (const t of ["claims", "streak", "earnings", "referrals", "games_won"]) {
        expect(src, `${file} must reference requirement_type '${t}'`).toContain(`'${t}'`)
      }
    }
  })

  it("seeds offerwall_providers rows for ALL walls incl. the 8 postback-pending ones", () => {
    const file = trackedSeed("offerwall_providers", 10)
    expect(file).toBeTruthy()
    if (file) {
      const src = read(file)
      for (const slug of [
        "wannads", "monlix", "revu", "adgem", "pollfish",
        "theoremreach", "cpalead", "minutestaff",
      ]) {
        expect(src, `${file} must seed the '${slug}' provider row`).toContain(slug)
      }
    }
  })
})
