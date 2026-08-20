import { describe, expect, it } from "vitest"
import { executeSignOut } from "@/lib/auth/sign-out"

describe("sign-out flow", () => {
  it("revokes the server session before clearing local auth state", async () => {
    const calls: string[] = []

    await executeSignOut({
      serverLogout: async () => { calls.push("server") },
      clientLogout: async () => { calls.push("client") },
      clearLocalState: () => { calls.push("clear") },
      redirect: () => { calls.push("redirect") },
    })

    expect(calls).toEqual(["server", "client", "clear", "redirect"])
  })

  it("still clears local state and redirects if a logout provider fails", async () => {
    const calls: string[] = []

    await executeSignOut({
      serverLogout: async () => { throw new Error("server unavailable") },
      clientLogout: async () => { calls.push("client") },
      clearLocalState: () => { calls.push("clear") },
      redirect: () => { calls.push("redirect") },
    })

    expect(calls).toEqual(["client", "clear", "redirect"])
  })
})
