import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("admin P2 polish (contract)", () => {
  it("offerwall approve/reverse use the atomic balance RPC — no read-then-write", () => {
    const src = read("app/api/admin/offerwalls/action/route.ts")
    expect((src.match(/admin_adjust_balance/g) || []).length).toBe(2)
    expect(src).not.toContain("Number(conversion.profiles.balance_satoshis) + Number(conversion.payout_satoshis)")
    expect(src).not.toContain("Math.max(")
    // overdraft reversals are refused, not clamped
    expect(src).toContain("INSUFFICIENT_BALANCE")
  })

  it("migration 106 provides the atomic adjust RPC locked to service_role", () => {
    const sql = read("scripts/106_admin_balance_rpc.sql")
    expect(sql).toContain("admin_adjust_balance")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("INSUFFICIENT_BALANCE")
    expect(sql).toContain("TO service_role")
  })

  it("irreversible admin actions require confirmation dialogs", () => {
    const users = read("components/admin/users-table.tsx")
    expect(users).toContain("AlertDialog")
    expect(users).toContain("setBanTarget")
    // the ban menu item routes through the interceptor, not straight to fetch
    expect(users).toContain('if (action === "ban") {')

    const fraud = read("components/admin/fraud-alerts.tsx")
    expect(fraud).toContain("AlertDialog")
    expect(fraud).toContain("setBanTarget")

    const withdrawals = read("components/admin/withdrawals-table.tsx")
    expect(withdrawals).toContain("AlertDialog")
    expect(withdrawals).toContain("approveTarget")
    expect(withdrawals).not.toMatch(/onClick=\{\(\) => handleAction\(withdrawal\.id, "approve"\)\}/)
  })

  it("boosters admin page no longer queries nonexistent profiles.email and shows real amounts", () => {
    const src = read("app/admin/boosters/page.tsx")
    expect(src).toContain("faucetpay_email")
    // no email field inside the profiles embed select
    expect(src).not.toMatch(/profiles!user_boosters_user_id_fkey \([\s\S]*?\bemail\b[\s\S]*?\)/)
    expect(src).not.toContain("booster.amount_paid ||")
    expect(src).toContain("amount_paid_usd")
    expect(src).toContain("unassigned") // NULL-tier badge
  })

  it("coupons enforce server-side bounds on create and patch", () => {
    const create = read("app/api/admin/coupons/route.ts")
    expect(create).toContain("between 1 and 365")
    const patch = read("app/api/admin/coupons/[id]/route.ts")
    expect(patch).toContain("bypassing the 1..10000 cap")
  })

  it("shortlinks validate rewards and whitelist PATCH columns; negative rewards rejected", () => {
    const src = read("app/api/admin/shortlinks/route.ts")
    expect(src).toContain("must be an integer between 1 and 100000")
    expect(src).toContain('for (const key of ["title", "destination_url", "is_active", "reward_satoshis", "view_time_seconds"]')
  })

  it("ads settings PATCH whitelists editable columns", () => {
    const src = read("app/api/admin/ads/route.ts")
    expect(src).toContain('const allowedKeys = ["is_active", "position", "config", "updated_at"]')
  })

  it("system settings validated server-side against shared ranges", () => {
    const lib = read("lib/admin/system-settings-validation.ts")
    expect(lib).toContain("SYSTEM_SETTING_RANGES")
    expect(lib).toContain("Unknown setting key")
    const route = read("app/api/admin/settings/route.ts")
    expect(route).toContain("validateSystemSettingUpdates")
  })

  it("users page has pagination controls preserving filters", () => {
    const comp = read("components/admin/users-pagination.tsx")
    expect(comp).toContain("key !== \"page\"")
    const page = read("app/admin/users/page.tsx")
    expect(page).toContain("<UsersPagination")
  })

  it("audit badges check reversal actions before destructive ones", () => {
    const src = read("app/admin/audit/page.tsx")
    const unbanIdx = src.indexOf('action.includes("unban")')
    const banIdx = src.indexOf('action.includes("ban")')
    expect(unbanIdx).toBeGreaterThan(-1)
    expect(banIdx).toBeGreaterThan(-1)
    expect(unbanIdx).toBeLessThan(banIdx)
  })
})
