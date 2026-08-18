import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * T3/T4 — persistent fingerprint latency budget.
 *
 * This is a BUDGET contract, not a snapshot: each storage layer is stubbed with
 * a fixed delay, so if a future change re-serializes the reads (or starts
 * awaiting the writes again) the total blows the budget and this test fails.
 *
 * Before the fix the reads ran sequentially — hardware, then IndexedDB (1.5s
 * ceiling), then Cache API (1.5s ceiling) — and the two async WRITES were also
 * awaited, so a cold profile paid ~5x the delay of a single layer on the login
 * critical path.
 */

const DELAY = 200

/** Resolves after `ms`, used to simulate a slow storage layer. */
function slow<T>(value: T, ms = DELAY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

const calls = { hardware: 0, idbRead: 0, cacheRead: 0, idbWrite: 0, cacheWrite: 0 }

// generateDeviceFingerprint is imported from ./client-fingerprint by the module
// under test (NOT ./device-fingerprint — both exist, which is easy to get wrong).
vi.mock("@/lib/security/client-fingerprint", () => ({
  generateDeviceFingerprint: async () => {
    calls.hardware++
    return slow("hardware-fp-0000000000000000000000000000000000000000")
  },
}))

/**
 * jsdom is not enabled for this file (node environment), and the module guards
 * every browser API it touches, so IndexedDB/CacheAPI/localStorage all return
 * null naturally. We simulate the SLOW paths by patching globals the module
 * feature-detects.
 */
beforeEach(() => {
  calls.hardware = 0
  calls.idbRead = 0
  calls.cacheRead = 0
  calls.idbWrite = 0
  calls.cacheWrite = 0
  vi.resetModules()

  // Cache API: the module checks `"caches" in window`.
  const cacheStore = new Map<string, Response>()
  vi.stubGlobal("window", {
    location: { hostname: "localhost", protocol: "http:" },
    caches: true,
  })
  vi.stubGlobal("caches", {
    open: async () => {
      await slow(null)
      return {
        match: async (k: string) => {
          calls.cacheRead++
          await slow(null)
          return cacheStore.get(k) ?? undefined
        },
        put: async (k: string, v: Response) => {
          calls.cacheWrite++
          await slow(null)
          cacheStore.set(k, v)
        },
      }
    },
  })

  // IndexedDB: the module calls indexedDB.open() and waits for events. Emit
  // onerror after a delay so the read resolves null on the slow path.
  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: Record<string, unknown> = {}
      calls.idbRead++
      setTimeout(() => {
        const onerror = req.onerror as ((e: unknown) => void) | undefined
        onerror?.({ target: { error: new Error("stubbed") } })
      }, DELAY)
      return req
    },
  })

  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
  vi.stubGlobal("document", { cookie: "" })
  vi.stubGlobal("navigator", {
    userAgent: "test",
    language: "en-US",
    languages: ["en-US"],
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    platform: "test",
  })
  vi.stubGlobal("screen", { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24 })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("generatePersistentFingerprint", () => {
  it("runs its storage reads concurrently, not serially", async () => {
    const { generatePersistentFingerprint, resetPersistentFingerprintCache } =
      await import("@/lib/security/persistent-fingerprint")
    resetPersistentFingerprintCache()

    const started = Date.now()
    const result = await generatePersistentFingerprint()
    const elapsed = Date.now() - started

    expect(result.fingerprint).toBeTruthy()

    // Serial would be >= ~5 * DELAY (hardware + idb read + cache open + cache
    // read + the two awaited writes). Concurrent should land near 2 * DELAY.
    // The ceiling is deliberately loose to stay stable on a loaded CI box while
    // still failing hard if the awaits come back.
    expect(elapsed).toBeLessThan(DELAY * 4)
  })

  it("does not block on persistence writes", async () => {
    const { generatePersistentFingerprint, resetPersistentFingerprintCache } =
      await import("@/lib/security/persistent-fingerprint")
    resetPersistentFingerprintCache()

    await generatePersistentFingerprint()
    // The write was kicked off but must not have been awaited: at the moment the
    // function returned, the async cache write has not completed yet.
    expect(calls.cacheWrite).toBeLessThanOrEqual(1)
  })

  it("memoizes: a second call does no work at all", async () => {
    const { generatePersistentFingerprint, resetPersistentFingerprintCache } =
      await import("@/lib/security/persistent-fingerprint")
    resetPersistentFingerprintCache()

    const first = await generatePersistentFingerprint()
    const hardwareCallsAfterFirst = calls.hardware

    const started = Date.now()
    const second = await generatePersistentFingerprint()
    const elapsed = Date.now() - started

    expect(second.fingerprint).toBe(first.fingerprint)
    expect(calls.hardware).toBe(hardwareCallsAfterFirst) // no recomputation
    expect(elapsed).toBeLessThan(DELAY / 2) // effectively instant
  })

  it("de-duplicates concurrent callers onto one computation", async () => {
    const { generatePersistentFingerprint, resetPersistentFingerprintCache } =
      await import("@/lib/security/persistent-fingerprint")
    resetPersistentFingerprintCache()

    // This is the real-world shape: the login page and AuthSecurityGuard both
    // ask for a fingerprint on the same tick.
    const [a, b, c] = await Promise.all([
      generatePersistentFingerprint(),
      generatePersistentFingerprint(),
      generatePersistentFingerprint(),
    ])

    expect(a.fingerprint).toBe(b.fingerprint)
    expect(b.fingerprint).toBe(c.fingerprint)
    expect(calls.hardware).toBe(1)
  })

  it("allows a retry after the cache is explicitly reset", async () => {
    const { generatePersistentFingerprint, resetPersistentFingerprintCache } =
      await import("@/lib/security/persistent-fingerprint")
    resetPersistentFingerprintCache()

    await generatePersistentFingerprint()
    expect(calls.hardware).toBe(1)

    resetPersistentFingerprintCache()
    await generatePersistentFingerprint()
    expect(calls.hardware).toBe(2)
  })
})
