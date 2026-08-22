import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("games launch fixes (contract)", () => {
  it("migration 103 allows the 'lost' status and closes game_sessions RLS writes", () => {
    const sql = read("scripts/103_games_logic_fixes.sql")
    expect(sql).toContain("'in_progress','completed','failed','expired','lost'")
    expect(sql).toContain("DROP POLICY IF EXISTS")
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.game_sessions/)
  })

  it("complete route verifies memory wins instead of trusting score > 0", () => {
    const src = read("app/api/games/complete/route.ts")
    expect(src).toContain("pairsMatched")
    expect(src).toContain("completed === true")
    // old vulnerable shortcut must be gone
    expect(src).not.toMatch(/gameType === "memory" \? score > 0/)
  })

  it("memory client reports completion metadata on both win and timeout", () => {
    const src = read("components/games/memory-game.tsx")
    expect((src.match(/pairsMatched/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(src).toContain("completed: false") // timer expiry path
    expect(src).toContain("completed: true") // board-complete path
  })

  it("block-blast client min duration matches server MIN_GAME_DURATIONS_MS", () => {
    const engine = read("lib/games/game-engine.ts")
    const client = read("components/games/block-blast-game.tsx")
    const durationsBlock = engine.match(/MIN_GAME_DURATIONS_MS[^{]*\{[\s\S]*?\}/)?.[0] ?? ""
    const serverMs = Number(durationsBlock.match(/block_blast:\s*(\d+)/)?.[1])
    const clientSec = Number(client.match(/const MIN_GAME_DURATION = (\d+)/)?.[1])
    expect(serverMs / 1000).toBe(clientSec)
  })

  it("games status route fails closed when the database is unavailable", () => {
    const src = read("app/api/games/status/route.ts")
    expect(src.match(/canPlay: false/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).not.toMatch(/canPlay: true/)
    expect(src).toContain("degraded: true")
  })

  it("snake difficulty speed is actually applied", () => {
    const src = read("components/games/snake-game.tsx")
    expect(src).toContain("useState(baseSpeed)")
    expect(src).toContain("baseSpeedRef.current || INITIAL_SPEED")
  })

  it("tournaments API writes canonical 061 columns", () => {
    const src = read("app/api/tournaments/route.ts")
    expect(src).toContain('category: cfg.type')
    expect(src).toContain('prize_pool_satoshis: cfg.prize_pool')
    expect(src).toContain('.eq("category", type)')
    expect(src).not.toContain('.eq("type", type)')
  })

  it("leaderboard uses amount_satoshis + admin client + canonical participant columns", () => {
    const src = read("app/api/tournaments/leaderboard/route.ts")
    expect(src).toContain("amount_satoshis")
    expect(src).toContain("final_rank")
    expect(src).toContain("prize_won_satoshis")
    expect(src).toContain("createAdminClient()")
    expect(src).not.toMatch(/\bselect\("amount"\)/)
  })

  it("dead legacy reward block is removed from complete route", () => {
    const src = read("app/api/games/complete/route.ts")
    expect(src).not.toContain("add_game_reward")
    expect(src).not.toContain('"game_reward"')
  })

  it("migration 104 reconciles tournaments schema split-brain", () => {
    const sql = read("scripts/104_tournaments_schema_reconciliation.sql")
    expect(sql).toContain("supporter_ads_watched")
    expect(sql).toContain("tournaments_sync_columns")
    expect(sql).toContain("tournament_participants_sync")
  })
})
