import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("PTC server-started watch contract", () => {
  it("does not start the reward clock on the read-only ad lookup", () => {
    const route = read("app/api/ptc/[id]/route.ts")
    const getBody = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"))
    expect(getBody).not.toContain("createWatchToken")
    expect(getBody).not.toContain("watchToken")
  })

  it("starts the signed session only through the POST start transition", () => {
    const route = read("app/api/ptc/[id]/route.ts")
    expect(route).toContain("export async function POST")
    expect(route).toContain("createWatchToken")
    expect(route).toContain("watchStartedAt")
  })

  it("starts PTC from the user action and only then starts the client timer", () => {
    const page = read("app/dashboard/ptc/watch/[id]/page.tsx")
    expect(page).toContain("fetch(`/api/ptc/${id}`)")
    expect(page).toContain("method: \"POST\"")
    expect(page).toContain("setStatus(\"watching\")")
  })

  it("applies the budget floor and schema compatibility in a forward migration", () => {
    const migration = read("scripts/091_ptc_server_start_and_budget_floor.sql")
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS start_date")
    expect(migration).toContain("remaining_budget_satoshis >= v_ad.reward_satoshis")
    expect(migration).toContain("DROP POLICY IF EXISTS ptc_views_insert")
  })
})
