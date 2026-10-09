import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const proxyDeps = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock("@/lib/redis/rate-limiter", () => ({
  checkRateLimit: proxyDeps.checkRateLimit,
}))
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: proxyDeps.updateSession,
}))

import proxy from "@/proxy"

describe("nonce CSP for dynamic HTML routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proxyDeps.checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 199,
      retryAfter: 0,
    })
    proxyDeps.updateSession.mockImplementation(async (request: NextRequest) =>
      NextResponse.next({ request }),
    )
  })

  it.each(["/dashboard", "/admin", "/auth/login", "/l/short-id"])(
    "forwards a per-request nonce policy to Next.js for %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://example.test${path}`))
      const forwardedRequest = proxyDeps.updateSession.mock.calls[0]?.[0] as NextRequest | undefined
      const requestPolicy = forwardedRequest?.headers.get("content-security-policy")
      const responsePolicy = response.headers.get("content-security-policy")
      const scriptSource = requestPolicy?.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1] ?? ""
      const nonce = scriptSource.match(/'nonce-([^']+)'/)?.[1]

      expect(forwardedRequest).toBeDefined()
      expect(requestPolicy).toBeTruthy()
      expect(responsePolicy).toBeTruthy()
      expect(scriptSource).toContain("'strict-dynamic'")
      expect(scriptSource).not.toContain("'unsafe-inline'")
      expect(nonce).toBeTruthy()
      expect(forwardedRequest?.headers.get("x-nonce")).toBe(nonce)
      expect(responsePolicy).toContain(`'nonce-${nonce}'`)
    },
  )

  it("generates a fresh nonce per request and preserves session cookies", async () => {
    const cookie = "sb-project-auth-token=opaque"
    const first = await proxy(new NextRequest("https://example.test/dashboard", { headers: { cookie } }))
    const second = await proxy(new NextRequest("https://example.test/dashboard", { headers: { cookie } }))
    const firstRequest = proxyDeps.updateSession.mock.calls[0]?.[0] as NextRequest
    const secondRequest = proxyDeps.updateSession.mock.calls[1]?.[0] as NextRequest
    const firstNonce = first.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1]
    const secondNonce = second.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1]

    expect(firstNonce).toBeTruthy()
    expect(secondNonce).toBeTruthy()
    expect(firstNonce).not.toBe(secondNonce)
    expect(firstRequest.headers.get("cookie")).toBe(cookie)
    expect(secondRequest.headers.get("cookie")).toBe(cookie)
  })

  it.each(["/", "/blog/example", "/auth/forgot-password"])(
    "forwards nonce policy on dynamically rendered public page %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://example.test${path}`))
      const responsePolicy = response.headers.get("content-security-policy") ?? ""
      const nonce = responsePolicy.match(/'nonce-([^']+)'/)?.[1]

      expect(nonce).toBeTruthy()
      expect(responsePolicy).toContain("'strict-dynamic'")
      expect(response.headers.get("x-middleware-request-content-security-policy")).toContain(`'nonce-${nonce}'`)
      expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce)
      expect(proxyDeps.updateSession).not.toHaveBeenCalled()
    },
  )

  it("does not apply a document nonce to the referral route handler", async () => {
    const response = await proxy(new NextRequest("https://example.test/ref/ABC123"))

    expect(response.headers.get("content-security-policy")).toBeNull()
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBeNull()
  })

  it.each(["/about", "/blog", "/blog/", "/status"])(
    "does not force nonce rendering for cacheable public page %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://example.test${path}`))

      expect(response.headers.get("content-security-policy")).toBeNull()
      expect(proxyDeps.updateSession).not.toHaveBeenCalled()
    },
  )
})
