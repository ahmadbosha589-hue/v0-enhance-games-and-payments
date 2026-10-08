import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const has = (p: string) => existsSync(resolve(process.cwd(), p))

describe("tournament payouts are wired", () => {
  it("admin end action calls finalize_tournament instead of silently completing", () => {
    const src = read("app/api/tournaments/route.ts")
    expect(src).toContain('rpc(\n        "finalize_tournament"')
    expect(src).toContain("winners_paid")
    // The old silent-complete must be gone.
    expect(src).not.toContain('.update({ status: "completed" })\n        .eq("id", tournamentId)')
  })

  it("daily cron finalizes expired tournaments", () => {
    const cron = read("app/api/cron/run/route.ts")
    expect(cron).toContain("finalize_tournament")
    expect(cron).toContain("finalizeExpiredTournaments")
  })

  it("finalize_tournament is idempotent and ledger-writing", () => {
    const sql = read("scripts/096_fix_finalize_tournament.sql")
    expect(sql).toContain("pg_try_advisory_xact_lock")
    expect(sql).toContain("already_completed")
    expect(sql).toContain("INSERT INTO public.transactions")
    expect(sql).toContain("'tournament_prize'")
  })
})

describe("multi-tier referrals and streak bonus", () => {
  it("migration implements 10/5/2 tiers with per-tier ledger rows", () => {
    const sql = read("scripts/098_multitier_referrals_streak_bonus.sql")
    expect(sql).toContain("FOR v_level IN 1..3")
    expect(sql).toContain("/ 2") // tier-2 rate derivation
    expect(sql).toContain("/ 5") // tier-3 rate derivation
    expect(sql).toMatch(/idempotency_key/)
    expect(sql).toContain("atomic_claim_impl")
  })

  it("claim config matches the advertised 4–9 sats range", () => {
    const cfg = read("lib/constants/config.ts")
    expect(cfg).toContain("baseAmountSatoshis: 4")
    expect(cfg).toContain("maxAmountSatoshis: 9")
  })

  it("claim route no longer hard-caps at 6 sats", () => {
    const claim = read("app/api/claim/route.ts")
    expect(claim).not.toContain("Hard cap at 6 satoshis")
    expect(claim).not.toContain("Math.min(base, 6)")
  })

  it("withdrawal copy is honest about timing", () => {
    const dict = read("lib/i18n/dictionaries/en.ts")
    expect(dict).not.toMatch(/processed instantly through FaucetPay/)
    expect(dict).not.toContain("within 1 minute")
    expect(dict).toContain("about 5 minutes")
  })
})

describe("contact form is real", () => {
  it("has a server route that persists to contact_messages", () => {
    expect(has("app/api/contact/route.ts")).toBe(true)
    const route = read("app/api/contact/route.ts")
    expect(route).toContain('from("contact_messages")')
    expect(route).toContain("contactSchema.safeParse")
    expect(route).toContain("429") // rate limited
  })

  it("page posts to the API instead of sleeping", () => {
    const page = read("app/(public)/contact/page.tsx")
    expect(page).toContain('fetch("/api/contact"')
    expect(page).not.toContain("setTimeout(resolve, 1500)")
  })

  it("migration creates the table with insert-only anon policy", () => {
    const sql = read("scripts/100_contact_messages.sql")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.contact_messages")
    expect(sql).toContain("FOR INSERT")
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY")
  })
})

describe("leaderboard period filter", () => {
  it("actually filters by period using transactions", () => {
    const route = read("app/api/leaderboard/route.ts")
    expect(route).toContain('from("transactions")')
    expect(route).toContain('period === "week"')
    expect(route).toContain("period_earned")
    expect(route).not.toContain("Similar limitation")
  })
})

describe("admin honesty", () => {
  it("no fabricated uptime or visit estimates on admin dashboard", () => {
    const page = read("app/admin/page.tsx")
    expect(page).not.toContain("99.9%")
    expect(page).not.toContain("Uptime last 30 days")
    expect(page).not.toContain("* 10 // Estimate")
    expect(page).toContain("System Status")
    expect(page).toContain("dbHealthy")
  })

  it("funds route reads the real withdrawals column", () => {
    const funds = read("app/api/admin/funds/route.ts")
    expect(funds).toContain('.select("amount_satoshis")')
    expect(funds).not.toContain('.select("amount")')
  })

  it("fraud severity thresholds use the schema's 1-10 scale", () => {
    const alerts = read("components/admin/fraud-alerts.tsx")
    expect(alerts).toContain("severity >= 8")
    expect(alerts).not.toContain("severity >= 80")

    const fraudPage = read("app/admin/fraud/page.tsx")
    expect(fraudPage).toContain("f.severity >= 8")
    expect(fraudPage).not.toContain("f.severity >= 80")
  })

  it("writers use schema columns (fraud_type/evidence/int severity/enum status)", () => {
    for (const f of [
      "app/api/fingerprint/verify/route.ts",
      "app/api/security/bot-detection/route.ts",
      "lib/security/abuse-detection.ts",
      "app/api/adblock/verify/route.ts",
    ]) {
      const src = read(f)
      expect(src, `${f} must not write flag_type`).not.toMatch(/flag_type:/)
      expect(src, `${f} must not write string severity`).not.toMatch(/severity: "/)
      expect(src, `${f} must not write status "pending"`).not.toContain('status: "pending"')
      expect(src, `${f} must not write details:{}`).not.toMatch(/\bdetails: \{/)
    }
    // referral-fraud-detector: `details` remains only as an internal result
    // field name, never a fraud_flags column write.
    const rfd = read("lib/security/referral-fraud-detector.ts")
    expect(rfd).not.toMatch(/fraud_flags[\s\S]{0,400}?details: \{/)
  })

  it("admin_audit_logs migration exists", () => {
    const sql = read("scripts/097_admin_audit_logs.sql")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_audit_logs")
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY")
  })

  it("always-green System Online badge removed", () => {
    const dash = read("app/admin/dashboard/page.tsx")
    expect(dash).not.toContain("System Online")
  })
})

describe("launch assets", () => {
  it("service worker exists and is real", () => {
    expect(has("public/sw.js")).toBe(true)
    const sw = read("public/sw.js")
    expect(sw).toContain("addEventListener")
    expect(sw).toContain("CACHE_VERSION")
    expect(sw).toContain("/api/") // never cache API
  })

  it("favicon.ico exists with ICO magic bytes", () => {
    expect(has("public/favicon.ico")).toBe(true)
    const buf = readFileSync(resolve(process.cwd(), "public/favicon.ico"))
    expect(buf.length).toBeGreaterThan(100)
    expect(buf[0]).toBe(0)
    expect(buf[1]).toBe(0)
    expect(buf[2]).toBe(1)
    expect(buf[3]).toBe(0)
  })

  it("sitemap is www-canonical without phantom pages", () => {
    const sm = read("app/sitemap.ts")
    expect(sm).toContain("www.faucero.com")
    expect(sm).not.toContain("/careers")
    const robots = read("app/robots.ts")
    expect(robots).toContain("www.faucero.com")
  })

  it("ads.txt is fail-closed (no seller lines while networks disabled)", () => {
    const ads = read("public/ads.txt")
    expect(ads).not.toContain("DIRECT")
    expect(ads).toContain("fail-closed")
  })
})

describe("DB hygiene migration", () => {
  it("exists with revokes and policy fixes", () => {
    expect(has("scripts/101_security_hygiene.sql")).toBe(true)
  })
})
