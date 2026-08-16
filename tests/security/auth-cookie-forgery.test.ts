import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * RC-1 — Unverified JWT accepted as identity (auth bypass -> admin takeover).
 *
 * lib/supabase/server.ts previously base64-decoded the `sb-<ref>-auth-token`
 * cookie and returned the embedded `user` object with NO signature check
 * (decodeJwtPayload only split on "."). Because:
 *
 *   1. getUser() falls back to that decode when the Supabase Auth API is slow,
 *   2. admin routes then resolve `role` with the SERVICE-ROLE client (RLS
 *      bypassed), and
 *   3. admin UUIDs are publicly obtainable (/api/leaderboard selects `id`,
 *      /api/2fa/status returns `userId` for any email with 2FA enabled),
 *
 * any anonymous visitor could mint an admin session by setting one cookie.
 *
 * These tests pin the fix: identity MUST come from a cryptographically verified
 * token, while the availability property that motivated the fallback (a slow or
 * down Auth API must not bounce a logged-in user) is preserved — verifying a JWT
 * offline needs no Auth API call at all.
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

// The Supabase Auth API is unreachable: exactly the condition the cookie-decode
// fallback exists for. Strategies 1 and 2 must fail so we exercise strategy 3.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error("Auth API unreachable"),
      }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  }),
}))

vi.mock("@supabase/supabase-js", () => ({ createClient: () => null }))

const VICTIM_ADMIN_ID = "3f6b1c9e-1111-4222-8333-444455556666"
const HS256_SECRET = "test-jwt-secret-at-least-32-chars-long!!"
const ISSUER = "https://testproject.supabase.co/auth/v1"

/** Mirrors @supabase/ssr's storage format: "base64-" + b64(JSON session). */
function forgeSessionCookie(userId: string, accessToken = "not.a.real.jwt"): string {
  const payload = JSON.stringify({
    access_token: accessToken,
    refresh_token: "x",
    user: { id: userId, email: "attacker@gmail.com", role: "authenticated" },
  })
  return "base64-" + Buffer.from(payload, "utf8").toString("base64")
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url")
}

describe("RC-1: forged auth cookie must never grant identity", () => {
  beforeEach(() => {
    cookieJar.clear()
    vi.resetModules()
    process.env.SUPABASE_JWT_SECRET = HS256_SECRET
  })

  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET
  })

  it("rejects an unsigned forged session cookie", async () => {
    cookieJar.set("sb-testproject-auth-token", forgeSessionCookie(VICTIM_ADMIN_ID))
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })

  it("rejects a chunked forged cookie (.0/.1 split)", async () => {
    const forged = forgeSessionCookie(VICTIM_ADMIN_ID)
    const mid = Math.floor(forged.length / 2)
    cookieJar.set("sb-testproject-auth-token.0", forged.slice(0, mid))
    cookieJar.set("sb-testproject-auth-token.1", forged.slice(mid))
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })

  it("rejects a bare alg=none JWT", async () => {
    const token = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
      sub: VICTIM_ADMIN_ID,
      iss: ISSUER,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`
    cookieJar.set("sb-testproject-auth-token", token)
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })

  it("rejects a JWT signed with the wrong secret", async () => {
    const { SignJWT } = await import("jose")
    const token = await new SignJWT({ sub: VICTIM_ADMIN_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-value!!"))

    cookieJar.set(
      "sb-testproject-auth-token",
      "base64-" +
        Buffer.from(JSON.stringify({ access_token: token }), "utf8").toString("base64"),
    )
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })

  it("rejects a correctly signed but EXPIRED token", async () => {
    const { SignJWT } = await import("jose")
    const token = await new SignJWT({ sub: VICTIM_ADMIN_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(HS256_SECRET))

    cookieJar.set(
      "sb-testproject-auth-token",
      "base64-" +
        Buffer.from(JSON.stringify({ access_token: token }), "utf8").toString("base64"),
    )
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })

  it("ignores the cookie's `user` object and trusts only the token claims", async () => {
    // Real signed token for user A, but the cookie's plaintext `user` block
    // claims to be the admin. The `user` object is attacker-controlled even on
    // an otherwise-valid session, so it must never be the identity source.
    const { SignJWT } = await import("jose")
    const REAL_USER = "aaaaaaaa-2222-4333-8444-555566667777"
    const token = await new SignJWT({ sub: REAL_USER, email: "real@gmail.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(HS256_SECRET))

    const payload = JSON.stringify({
      access_token: token,
      user: { id: VICTIM_ADMIN_ID, email: "attacker@gmail.com" },
    })
    cookieJar.set(
      "sb-testproject-auth-token",
      "base64-" + Buffer.from(payload, "utf8").toString("base64"),
    )

    const { getUser } = await import("@/lib/supabase/server")
    const user = await getUser()
    expect(user?.id).toBe(REAL_USER)
    expect(user?.id).not.toBe(VICTIM_ADMIN_ID)
  })

  it("ACCEPTS a correctly signed, unexpired token while the Auth API is down", async () => {
    // The availability guarantee: a valid session still resolves offline, so the
    // dashboard does not bounce users during a Supabase Auth outage.
    const { SignJWT } = await import("jose")
    const token = await new SignJWT({ sub: VICTIM_ADMIN_ID, email: "owner@gmail.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(HS256_SECRET))

    cookieJar.set(
      "sb-testproject-auth-token",
      "base64-" +
        Buffer.from(JSON.stringify({ access_token: token }), "utf8").toString("base64"),
    )

    const { getUser } = await import("@/lib/supabase/server")
    const user = await getUser()
    expect(user?.id).toBe(VICTIM_ADMIN_ID)
    // Marked as offline-derived so privileged paths can require live verification.
    expect((user as { __from_cookie?: true })?.__from_cookie).toBe(true)
  })

  it("returns null when no auth cookie is present at all", async () => {
    const { getUser } = await import("@/lib/supabase/server")
    expect(await getUser()).toBeNull()
  })
})
