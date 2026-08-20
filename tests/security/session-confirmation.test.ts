import { describe, expect, it } from "vitest"
import { waitForServerSession } from "@/lib/auth/session-confirmation"

describe("server session confirmation", () => {
  it("retries while the auth cookie is propagating", async () => {
    let calls = 0
    const result = await waitForServerSession(async () => {
      calls += 1
      return new Response(JSON.stringify({ user: calls >= 3 ? { id: "user-1" } : null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }, { attempts: 4, delayMs: 0 })

    expect(result).toBe(true)
    expect(calls).toBe(3)
  })

  it("does not authorize a redirect when the server never sees a session", async () => {
    const result = await waitForServerSession(async () => new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }), { attempts: 2, delayMs: 0 })

    expect(result).toBe(false)
  })
})
