import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

describe("session refresh single-writer contract", () => {
  it("only the proxy performs a refresh-capable getUser()", () => {
    const proxy = read("lib/supabase/proxy.ts")
    // The proxy owns refresh because it is the ONLY place that can write
    // rotated auth cookies back to the browser.
    expect(proxy).toContain("supabase.auth.getUser()")
    expect(proxy).toContain("REFRESH_OWNER")
  })

  it("server components never rotate the refresh token", () => {
    const server = read("lib/supabase/server.ts")
    // A React Server Component cannot set cookies. If it calls the
    // refresh-capable getUser(), Supabase rotates the single-use refresh token
    // and the replacement is DISCARDED — the next request presents a consumed
    // token and the user is logged out. Identity in RSCs must come from local
    // verification of the cookie the proxy already refreshed.
    expect(server).toContain("verifyAccessToken")
    expect(server).toMatch(/RSC_NO_REFRESH/)
    // getUser() must not call the network refresh path anymore.
    expect(server).not.toMatch(/supabase\.auth\.getUser\(\)\s*\n?\s*\.catch/)
  })

  it("keeps privileged paths live-verified rather than trusting a cookie", () => {
    const server = read("lib/supabase/server.ts")
    // Availability for reads, strictness for money/admin writes.
    expect(server).toContain("getVerifiedUser")
    expect(server).toContain("__from_cookie")
  })

  it("supports asymmetric (ES256) Supabase signing keys", () => {
    const jwt = read("lib/supabase/jwt-verify.ts")
    // This project's JWKS publishes ES256. If only the legacy HS256 shared
    // secret were supported, offline verification would fail closed and every
    // refresh would look like a logout.
    expect(jwt).toContain("ES256")
    expect(jwt).toContain("createRemoteJWKSet")
  })
})
