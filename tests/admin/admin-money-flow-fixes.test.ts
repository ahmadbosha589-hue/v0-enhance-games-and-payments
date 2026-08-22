import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("admin money-flow fixes (contract)", () => {
  it("migration 105 provides the atomic refund RPC", () => {
    const sql = read("scripts/105_admin_withdrawal_refund.sql")
    expect(sql).toContain("admin_reject_withdrawal_refund")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("total_withdrawn_satoshis")
    expect(sql).toContain("TO service_role")
  })

  it("shared refund helper guards status and never refunds processed rows", () => {
    const src = read("lib/admin/reject-withdrawal.ts")
    expect(src).toContain('.in("status", ["pending", "processing"])')
    expect(src).toContain("ALREADY_PROCESSED")
    expect(src).toContain("admin_reject_withdrawal_refund")
  })

  it("users/action ban cascade no longer reuses a stale balance read", () => {
    const src = read("app/api/admin/users/action/route.ts")
    expect(src).toContain("rejectWithdrawalAndRefund")
    expect(src).not.toContain("Number(targetProfile.balance_satoshis) + Number(withdrawal.amount_satoshis)")
    // moderator authorization is per-action now
    expect(src).toContain("MODERATOR_ALLOWED")
    // adjust_balance rejects overdrafts instead of clamping to zero
    expect(src).toContain("exceeds current balance")
    expect(src).not.toContain("Math.max(0, Number(targetProfile.balance_satoshis) + amount)")
  })

  it("withdrawals approve claims atomically into 'approved' (no approve→reject double-process)", () => {
    const src = read("app/api/admin/withdrawals/action/route.ts")
    expect(src).toMatch(/status: "approved"/)
    expect(src).toMatch(/\.eq\("status", "pending"\)/)
    expect(src).not.toMatch(/status: "pending",\s*\n\s*reviewed_at/)
    // reject path uses the shared helper — no phantom refund when profile read fails
    expect(src).toContain("rejectWithdrawalAndRefund")
    expect(src).not.toContain("Number(userProfile.balance_satoshis) + Number(withdrawal.amount_satoshis)")
  })

  it("fraud ban uses the flag's own user_id as the authoritative target", () => {
    const src = read("app/api/admin/fraud/action/route.ts")
    expect(src).toContain('select("status, action_taken, resolution_notes, user_id")')
    expect(src).toContain("authoritativeUserId")
    expect(src).toContain("does not match the flagged user")
    expect(src).toContain("rejectWithdrawalAndRefund")
    expect(src).not.toContain("Number(userProfile.balance_satoshis) + Number(withdrawal.amount_satoshis)")
  })

  it("funds adjustment writes schema-correct ledger rows and surfaces insert errors", () => {
    const src = read("app/api/admin/funds/route.ts")
    expect(src).toContain('type: "adjustment"')
    expect(src).toContain("amount_satoshis: ledgerDelta")
    expect(src).not.toContain('type: "admin_adjustment"')
    expect(src).toContain("txInsertError")
  })

  it("notifications: 'active' audience implemented, correct column, paged recipients", () => {
    const src = read("app/api/admin/notifications/route.ts")
    expect(src).toContain('targetAudience === "active"')
    expect(src).toContain(".range(from, from + PAGE_SIZE - 1)")
    expect(src.match(/is_read: false/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).not.toMatch(/\bread: false/)
  })
})
