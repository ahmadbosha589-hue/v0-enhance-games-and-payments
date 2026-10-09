import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("ad-network save path only touches tables a migration actually creates", () => {
  it("a numbered migration creates ad_network_configs", () => {
    const migration = read("scripts/113_ad_network_configs.sql")
    expect(/CREATE TABLE IF NOT EXISTS (?:public\.)?ad_network_configs/.test(migration)).toBe(true)
    // The migration runner only picks up scripts/1xx_* (and 071-099) files —
    // the standalone create-ad-network-tables.sql is NOT executed by it.
    expect(/CREATE TABLE IF NOT EXISTS (?:public\.)?ad_network_configs/.test(migration)).toBe(true)
  })

  it("the route never references the never-migrated admin_logs table", () => {
    const src = read("app/api/admin/ad-networks/route.ts")
    expect(src).not.toContain('from("admin_logs")')
    // All audit writes go to the real, migrated table instead.
    expect(src).toContain('from("admin_audit_logs")')
  })

  it("audit inserts match the 097 admin_audit_logs schema", () => {
    const src = read("app/api/admin/ad-networks/route.ts")
    // 097 columns: admin_id, action, resource_type, resource_id, metadata, created_at.
    // The old insert used id/target_user_id/idempotency_key/details — none exist.
    for (const bad of ["id: auditLogId", "target_user_id", "idempotency_key: ", "details: {"]) {
      expect(src).not.toContain(bad)
    }
    for (const good of ["resource_type: \"ad_network\"", "metadata: "]) {
      expect(src).toContain(good)
    }
  })

  it("audit inserts use columns that exist on admin_audit_logs (097)", () => {
    const src = read("app/api/admin/ad-networks/route.ts")
    const inserts = [...src.matchAll(/from\("admin_audit_logs"\)[\s\S]{0,10}?\.insert\(\{([\s\S]*?)\}\)/g)]
    expect(inserts.length).toBeGreaterThanOrEqual(3)
    const allowed = new Set(["admin_id", "action", "resource_type", "resource_id", "metadata", "created_at"])
    for (const [, body] of inserts) {
      const cols = [...body.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
      expect(cols.length).toBeGreaterThan(0)
      for (const col of cols) {
        expect(allowed.has(col), `audit insert uses unknown column "${col}"`).toBe(true)
      }
    }
  })
})
