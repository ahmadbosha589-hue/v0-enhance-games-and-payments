import { describe, expect, it } from "vitest"
import { generateSignedCSRFToken, validateSignedCSRFToken } from "@/lib/security/csrf-token"

const STRONG_SECRET = "unit-test-csrf-secret-must-be-at-least-32-bytes"
const NOW = 1_800_000_000_000

describe("signed CSRF token validation", () => {
  it("accepts an untampered token within its one-hour lifetime", () => {
    const token = generateSignedCSRFToken(STRONG_SECRET, NOW)
    expect(validateSignedCSRFToken(token, STRONG_SECRET, NOW + 1_000)).toBe(true)
  })

  it("rejects a token signed with another secret", () => {
    const token = generateSignedCSRFToken(STRONG_SECRET, NOW)
    expect(validateSignedCSRFToken(token, "a-different-secret-that-is-also-32-bytes", NOW)).toBe(false)
  })

  it("rejects a token whose value has been modified", () => {
    const token = generateSignedCSRFToken(STRONG_SECRET, NOW)
    const [value, timestamp, signature] = token.split(":")
    const changed = `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}:${timestamp}:${signature}`
    expect(validateSignedCSRFToken(changed, STRONG_SECRET, NOW)).toBe(false)
  })

  it("rejects a token older than one hour", () => {
    const token = generateSignedCSRFToken(STRONG_SECRET, NOW)
    expect(validateSignedCSRFToken(token, STRONG_SECRET, NOW + 3_600_001)).toBe(false)
  })

  it("rejects tokens issued more than 30 seconds in the future", () => {
    const token = generateSignedCSRFToken(STRONG_SECRET, NOW + 30_001)
    expect(validateSignedCSRFToken(token, STRONG_SECRET, NOW)).toBe(false)
  })

  it.each(["", "x".repeat(31), "not-a-token", `${"a".repeat(64)}:1:${"b".repeat(64)}`])(
    "rejects malformed or weakly signed input (%s)",
    (token) => {
      expect(validateSignedCSRFToken(token, STRONG_SECRET, NOW)).toBe(false)
    },
  )

  it("refuses to issue tokens with a weak secret", () => {
    expect(() => generateSignedCSRFToken("weak", NOW)).toThrow(/32 UTF-8 bytes/)
  })
})
