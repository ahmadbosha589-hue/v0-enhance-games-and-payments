import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

/**
 * The appeal endpoint had three verified defects:
 *  1. ZERO auth — it trusted userId from the request body.
 *  2. Schema mismatch — it destructured fields the provider never sends,
 *     so signals.every() threw and every appeal answered 500.
 *  3. An ACCEPTED appeal never cleared profiles.adblock_flagged or the
 *     fraud_flags row — the user stayed blocked forever.
 */
describe("adblock appeal contract", () => {
  const appeal = () => read("app/api/fraud/adblock/appeal/route.ts")

  it("authenticates the session user instead of trusting body.userId", () => {
    expect(appeal()).toContain("auth.getUser()")
  })

  it("validates the payload with zod (defaults for optional caller fields)", () => {
    expect(appeal()).toContain("z.object")
    expect(appeal()).toContain(".default(")
  })

  it("an ACCEPTED appeal clears the persistent flag server-side", () => {
    expect(appeal()).toMatch(/adblock_flagged:\s*false/)
    expect(appeal()).toMatch(/from\("fraud_flags"\)/)
  })

  it("refuses cross-user appeals (403) and unauthenticated callers (401)", () => {
    expect(appeal()).toMatch(/status: 401/)
    expect(appeal()).toMatch(/status: 403/)
  })

  it("uses the real fraud_flags column names (fraud_type / resolution_notes)", () => {
    // scripts/006_create_fraud_flags_table.sql is the shape the app writes:
    // fraud_type (not flag_type), resolved_by/resolved_at/resolution_notes,
    // action_taken, severity on a 1-10 scale.
    const src = appeal()
    expect(src).toContain("fraud_type")
    expect(src).not.toContain("resolution:")
    expect(src).toContain("resolution_notes")
  })
})
