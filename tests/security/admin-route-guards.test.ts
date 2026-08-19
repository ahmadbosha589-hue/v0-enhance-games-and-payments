import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getUser: vi.fn(),
  getProfile: vi.fn(),
}))

const adminClient = vi.hoisted(() => ({
  requireAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => auth)
vi.mock("@/lib/supabase/admin-client", () => adminClient)
vi.mock("@/lib/ads/network-config-crypto", () => ({
  encryptNetworkConfig: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}))

import { DELETE as deleteAdNetwork, GET as getAdNetwork, POST as postAdNetwork } from "@/app/api/admin/ad-networks/route"
import { GET as getAdblockStats } from "@/app/api/admin/adblock-stats/route"
import { GET as getAnalyticsData } from "@/app/api/admin/analytics-data/route"
import { GET as getSupabaseStatus } from "@/app/api/admin/supabase-status/route"

function request(method: string, path: string, body?: string): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    method,
    body,
    headers: body ? { "content-type": "application/json" } : undefined,
  })
}

async function expectForbidden(invoke: () => Promise<Response>) {
  const response = await invoke()

  expect(response.status).toBe(403)
  await expect(response.json()).resolves.toEqual({ error: "Forbidden" })
  expect(adminClient.requireAdminClient).not.toHaveBeenCalled()
  expect(auth.getUser).not.toHaveBeenCalled()
  expect(auth.getProfile).not.toHaveBeenCalled()
}

describe("Phase 02b admin API route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.requireAdmin.mockResolvedValue(null)
  })

  it("fails closed before ad-network GET reaches the service-role client", async () => {
    await expectForbidden(() => getAdNetwork(request("GET", "/api/admin/ad-networks")))
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })

  it("fails closed before ad-network POST reaches the service-role client", async () => {
    await expectForbidden(() =>
      postAdNetwork(request("POST", "/api/admin/ad-networks", JSON.stringify({ networkId: "network" }))),
    )
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })

  it("fails closed before ad-network DELETE reaches the service-role client", async () => {
    await expectForbidden(() =>
      deleteAdNetwork(request("DELETE", "/api/admin/ad-networks?networkId=network")),
    )
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })

  it("guards the formerly exposed adblock statistics route", async () => {
    await expectForbidden(() => getAdblockStats(request("GET", "/api/admin/adblock-stats")))
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })

  it("guards the formerly exposed analytics data route", async () => {
    await expectForbidden(() => getAnalyticsData())
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })

  it("guards the admin Supabase health route", async () => {
    await expectForbidden(() => getSupabaseStatus())
    expect(auth.requireAdmin).toHaveBeenCalledWith(["admin", "superadmin"])
  })
})
