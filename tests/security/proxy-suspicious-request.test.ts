import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

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

describe("Phase 02b proxy suspicious-request policy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proxyDeps.checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      retryAfter: 0,
    })
  })

  it("does not block security-looking words in ordinary query values", async () => {
    const request = new NextRequest(
      "https://example.test/api/health?search=union%20select%20javascript%3Aalert%281%29%20%3Cscript%3E",
    )

    const response = await proxy(request)

    expect(response.status).toBe(200)
    expect(proxyDeps.checkRateLimit).toHaveBeenCalledOnce()
    expect(proxyDeps.updateSession).not.toHaveBeenCalled()
  })

  it("still blocks executable schemes when they are supplied through redirect parameters", async () => {
    const request = new NextRequest(
      "https://example.test/api/health?redirect=javascript%3Aalert%281%29",
    )

    const response = await proxy(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Request blocked",
      code: "SECURITY_BLOCK",
    })
    expect(proxyDeps.checkRateLimit).not.toHaveBeenCalled()
  })
})
