import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabase.createClient,
}))

const originalSecret = process.env.CCXUA_SECRET_KEY
const originalWhitelistSetting = process.env.CCXUA_ENFORCE_IP_WHITELIST

function postbackRequest(params: URLSearchParams): NextRequest {
  return new NextRequest(`https://example.test/api/postback/ccxua?${params.toString()}`)
}

async function loadPostbackRoute() {
  vi.resetModules()
  return import("@/app/api/postback/[provider]/route")
}

function installMissingProviderRowMock() {
  supabase.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
      }),
    }),
  }))
  supabase.createClient.mockReturnValue({ from: supabase.from })
}

describe("Phase 02b postback signature controls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CCXUA_SECRET_KEY
    delete process.env.CCXUA_ENFORCE_IP_WHITELIST
    installMissingProviderRowMock()
  })

  afterEach(() => {
    vi.unstubAllEnvs()

    if (originalSecret === undefined) delete process.env.CCXUA_SECRET_KEY
    else process.env.CCXUA_SECRET_KEY = originalSecret

    if (originalWhitelistSetting === undefined) delete process.env.CCXUA_ENFORCE_IP_WHITELIST
    else process.env.CCXUA_ENFORCE_IP_WHITELIST = originalWhitelistSetting
  })

  it("rejects an unsigned callback when production has no provider secret", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { GET } = await loadPostbackRoute()
    const params = new URLSearchParams({
      subId: "user-id",
      transId: "transaction-id",
      reward: "1",
      sig: "anything",
    })

    const response = await GET(postbackRequest(params), {
      params: Promise.resolve({ provider: "ccxua" }),
    })

    expect(response.status).toBe(403)
    await expect(response.text()).resolves.toBe("ERROR: Signature doesn't match")
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("rejects a non-matching signature even when a provider secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "production")
    process.env.CCXUA_SECRET_KEY = "phase-02b-test-fixture"
    const { GET } = await loadPostbackRoute()
    const params = new URLSearchParams({
      subId: "user-id",
      transId: "transaction-id",
      reward: "1",
      sig: "not-the-signature",
    })

    const response = await GET(postbackRequest(params), {
      params: Promise.resolve({ provider: "ccxua" }),
    })

    expect(response.status).toBe(403)
    await expect(response.text()).resolves.toBe("ERROR: Signature doesn't match")
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("accepts the provider signature and continues to the guarded data path", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const fixtureSecret = "phase-02b-test-fixture"
    process.env.CCXUA_SECRET_KEY = fixtureSecret
    const subId = "user-id"
    const transId = "transaction-id"
    const reward = "1.25"
    const signature = createHash("md5")
      .update(`${subId}${transId}${reward}${fixtureSecret}`)
      .digest("hex")
    const { GET } = await loadPostbackRoute()
    const params = new URLSearchParams({ subId, transId, reward, sig: signature })

    const response = await GET(postbackRequest(params), {
      params: Promise.resolve({ provider: "ccxua" }),
    })

    // A valid signature gets past authentication. With no provider row, the
    // handler returns the documented provider acknowledgement without touching
    // balances or other tables.
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe("ok")
    expect(supabase.from).toHaveBeenCalledWith("offerwall_providers")
  })
})
