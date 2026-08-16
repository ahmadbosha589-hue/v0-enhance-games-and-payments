import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * S4 — administrative authorization choke point.
 *
 * Before requireAdmin() existed, every admin route inlined its own getUser() +
 * role lookup. Three different allow-lists had drifted apart and two routes
 * (admin/adblock-stats, admin/analytics-data) had no check at all. Combined with
 * RC-1 that meant a forged cookie reached service-role queries.
 *
 * These tests pin the contract:
 *   - no identity            -> null
 *   - identity, no profile   -> null
 *   - identity, role "user"  -> null
 *   - offline-verified admin -> null UNLESS live re-verification succeeds
 *   - live-verified admin    -> { user, profile }
 */

const cookieJar = new Map<string, string>()

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    get: (n: string) =>
      cookieJar.has(n) ? { name: n, value: cookieJar.get(n)! } : undefined,
    set: () => {},
  }),
}))

const ADMIN_ID = "3f6b1c9e-1111-4222-8333-444455556666"
const HS256_SECRET = "test-jwt-secret-at-least-32-chars-long!!"
const ISSUER = "https://testproject.supabase.co/auth/v1"

/** Controls what the mocked Supabase clients return, per test. */
const state = {
  liveUser: null as { id: string } | null,
  liveError: null as Error | null,
  profile: null as Record<string, unknown> | null,
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.liveUser },
        error: state.liveError,
      }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  }),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: state.profile,
            error: state.profile ? null : new Error("no rows"),
          }),
        }),
      }),
    }),
  }),
}))

async function signedCookie(sub: string): Promise<string> {
  const { SignJWT } = await import("jose")
  const token = await new SignJWT({ sub, email: "admin@gmail.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(HS256_SECRET))
  return (
    "base64-" +
    Buffer.from(JSON.stringify({ access_token: token }), "utf8").toString("base64")
  )
}

function forgedCookie(sub: string): string {
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({ access_token: "not.a.jwt", user: { id: sub } }),
      "utf8",
    ).toString("base64")
  )
}

describe("requireAdmin", () => {
  beforeEach(() => {
    cookieJar.clear()
    vi.resetModules()
    process.env.SUPABASE_JWT_SECRET = HS256_SECRET
    state.liveUser = null
    state.liveError = null
    state.profile = null
  })

  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET
  })

  it("returns null with no session at all", async () => {
    const { requireAdmin } = await import("@/lib/supabase/server")
    expect(await requireAdmin()).toBeNull()
  })

  it("returns null for a FORGED cookie even when the profile says admin", async () => {
    // The exact RC-1 escalation path: forged identity + service-role role lookup.
    cookieJar.set("sb-testproject-auth-token", forgedCookie(ADMIN_ID))
    state.profile = { id: ADMIN_ID, role: "superadmin" }
    const { requireAdmin } = await import("@/lib/supabase/server")
    expect(await requireAdmin()).toBeNull()
  })

  it("returns null when the live re-verification of an offline token fails", async () => {
    // Signed token (so getUser() resolves __from_cookie) but Auth API says no —
    // e.g. the session was revoked, or the user was banned, since it was issued.
    cookieJar.set("sb-testproject-auth-token", await signedCookie(ADMIN_ID))
    state.profile = { id: ADMIN_ID, role: "admin" }
    state.liveUser = null
    state.liveError = new Error("session revoked")
    const { requireAdmin } = await import("@/lib/supabase/server")
    expect(await requireAdmin()).toBeNull()
  })

  it("returns null for a live-verified user whose role is 'user'", async () => {
    cookieJar.set("sb-testproject-auth-token", await signedCookie(ADMIN_ID))
    state.liveUser = { id: ADMIN_ID }
    state.profile = { id: ADMIN_ID, role: "user" }
    const { requireAdmin } = await import("@/lib/supabase/server")
    expect(await requireAdmin()).toBeNull()
  })

  it("returns null when no profile row exists", async () => {
    cookieJar.set("sb-testproject-auth-token", await signedCookie(ADMIN_ID))
    state.liveUser = { id: ADMIN_ID }
    state.profile = null
    const { requireAdmin } = await import("@/lib/supabase/server")
    expect(await requireAdmin()).toBeNull()
  })

  it("grants a live-verified admin", async () => {
    cookieJar.set("sb-testproject-auth-token", await signedCookie(ADMIN_ID))
    state.liveUser = { id: ADMIN_ID }
    state.profile = { id: ADMIN_ID, role: "admin" }
    const { requireAdmin } = await import("@/lib/supabase/server")
    const result = await requireAdmin()
    expect(result?.user.id).toBe(ADMIN_ID)
    expect((result?.profile as { role: string }).role).toBe("admin")
  })

  it("honours a narrowed role allow-list", async () => {
    cookieJar.set("sb-testproject-auth-token", await signedCookie(ADMIN_ID))
    state.liveUser = { id: ADMIN_ID }
    state.profile = { id: ADMIN_ID, role: "moderator" }
    const { requireAdmin } = await import("@/lib/supabase/server")
    // moderator is NOT in the default allow-list…
    expect(await requireAdmin()).toBeNull()
    // …but is granted when explicitly permitted.
    expect(await requireAdmin(["moderator"])).not.toBeNull()
  })
})

describe("createAdminClient (S20)", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns null instead of downgrading to the anon key", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      const { createAdminClient } = await import("@/lib/supabase/server")
      // Previously this returned an anon-key client, so RLS-filtered reads
      // looked like legitimate empty results to every admin/money code path.
      expect(createAdminClient()).toBeNull()
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved
    }
  })
})
