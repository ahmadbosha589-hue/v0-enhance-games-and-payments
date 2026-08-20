import { afterEach, describe, expect, it, vi } from "vitest"
import { createWatchToken, verifyWatchToken } from "@/lib/rewards/watch-session"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("signed reward watch sessions", () => {
  it("round-trips a token for the same user/resource and rejects tampering", () => {
    vi.stubEnv("REWARD_SESSION_SECRET", "test-reward-session-secret")
    const now = Date.now()
    const token = createWatchToken({
      kind: "shortlink",
      userId: "user-1",
      resourceId: "resource-1",
      startedAt: now,
      expiresAt: now + 60_000,
    })

    expect(verifyWatchToken(token, {
      kind: "shortlink",
      userId: "user-1",
      resourceId: "resource-1",
      now,
    })).toMatchObject({
      kind: "shortlink",
      userId: "user-1",
      resourceId: "resource-1",
      startedAt: now,
    })

    expect(() => verifyWatchToken(`${token}tampered`, {
      kind: "shortlink",
      userId: "user-1",
      resourceId: "resource-1",
      now,
    })).toThrow()
  })

  it("rejects a token after its expiry or for another resource", () => {
    vi.stubEnv("REWARD_SESSION_SECRET", "test-reward-session-secret")
    const now = Date.now()
    const token = createWatchToken({
      kind: "ptc",
      userId: "user-1",
      resourceId: "ad-1",
      startedAt: now - 120_000,
      expiresAt: now - 60_000,
    })

    expect(() => verifyWatchToken(token, {
      kind: "ptc",
      userId: "user-1",
      resourceId: "ad-1",
      now,
    })).toThrow("expired")

    const liveToken = createWatchToken({
      kind: "ptc",
      userId: "user-1",
      resourceId: "ad-1",
      startedAt: now,
      expiresAt: now + 60_000,
    })
    expect(() => verifyWatchToken(liveToken, {
      kind: "ptc",
      userId: "user-1",
      resourceId: "ad-2",
      now,
    })).toThrow("mismatch")
  })
})
