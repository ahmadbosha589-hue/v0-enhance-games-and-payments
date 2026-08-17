import { describe, it, expect } from "vitest"
import {
  generateBase32Secret,
  generateTOTP,
  verifyTOTP,
  verifyTOTPWithStep,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "@/lib/2fa/totp"

/**
 * S6 — 2FA primitives.
 *
 * Two crash bugs are pinned here: crypto.timingSafeEqual() THROWS on a length
 * mismatch, and both verifyTOTP() and verifyBackupCode() fed it unvalidated
 * user input directly. A 5-digit code or a malformed backup code produced an
 * unhandled 500 rather than "invalid code" — and on /api/2fa/validate, which
 * was reachable unauthenticated, that was a remote crash.
 */

describe("verifyTOTP", () => {
  const secret = generateBase32Secret(20)

  it("accepts a freshly generated code", () => {
    expect(verifyTOTP(secret, generateTOTP(secret))).toBe(true)
  })

  it("rejects a wrong code", () => {
    const real = generateTOTP(secret)
    const wrong = real === "000000" ? "111111" : "000000"
    expect(verifyTOTP(secret, wrong)).toBe(false)
  })

  // These threw TypeError before safeEqual() / the format guard.
  it.each([
    ["too short", "12345"],
    ["too long", "1234567"],
    ["empty", ""],
    ["non-numeric", "abcdef"],
    ["whitespace", "12 456"],
    ["unicode", "１２３４５６"],
  ])("returns false (never throws) for a %s code", (_label, code) => {
    expect(() => verifyTOTP(secret, code)).not.toThrow()
    expect(verifyTOTP(secret, code)).toBe(false)
  })

  it("reports the matched time step so replays can be detected", () => {
    const code = generateTOTP(secret)
    const first = verifyTOTPWithStep(secret, code)
    expect(first.valid).toBe(true)
    expect(typeof first.step).toBe("number")

    // Same code verifies again — which is why the CALLER must persist the step
    // and refuse a repeat. The primitive itself is stateless by design.
    const second = verifyTOTPWithStep(secret, code)
    expect(second.step).toBe(first.step)
  })

  it("returns a null step when invalid", () => {
    expect(verifyTOTPWithStep(secret, "000000").step).toBeNull()
  })
})

describe("verifyBackupCode", () => {
  it("redeems a hashed code and reports its index", () => {
    const codes = generateBackupCodes(10)
    const stored = codes.map(hashBackupCode)

    const result = verifyBackupCode(codes[3], stored)
    expect(result.valid).toBe(true)
    expect(result.index).toBe(3)
  })

  it("accepts a code typed without its dash", () => {
    const codes = generateBackupCodes(3)
    const stored = codes.map(hashBackupCode)
    expect(verifyBackupCode(codes[0].replace("-", ""), stored).valid).toBe(true)
  })

  it("accepts lowercase input", () => {
    const codes = generateBackupCodes(3)
    const stored = codes.map(hashBackupCode)
    expect(verifyBackupCode(codes[1].toLowerCase(), stored).valid).toBe(true)
  })

  it("rejects an unknown code", () => {
    const stored = generateBackupCodes(5).map(hashBackupCode)
    expect(verifyBackupCode("DEAD-BEEF", stored).valid).toBe(false)
  })

  // Previously threw: a 64-char stored digest vs a short plaintext input.
  it.each([
    ["empty string", ""],
    ["short", "AB"],
    ["long", "A".repeat(200)],
  ])("returns false (never throws) for %s input", (_label, code) => {
    const stored = generateBackupCodes(5).map(hashBackupCode)
    expect(() => verifyBackupCode(code, stored)).not.toThrow()
    expect(verifyBackupCode(code, stored).valid).toBe(false)
  })

  it("handles an empty or malformed stored list without throwing", () => {
    expect(verifyBackupCode("ABCD-1234", []).valid).toBe(false)
    // Defensive: null/number entries must not crash the comparison loop.
    const dirty = [null, 42, undefined, ""] as unknown as string[]
    expect(() => verifyBackupCode("ABCD-1234", dirty)).not.toThrow()
    expect(verifyBackupCode("ABCD-1234", dirty).valid).toBe(false)
  })

  it("still redeems a legacy plaintext row", () => {
    // Defensive back-compat for any row written before hashing was applied.
    const codes = generateBackupCodes(2)
    expect(verifyBackupCode(codes[1], codes).valid).toBe(true)
  })

  it("produces codes in the documented XXXX-XXXX shape", () => {
    for (const c of generateBackupCodes(10)) {
      expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
    }
  })

  it("produces unique codes", () => {
    const codes = generateBackupCodes(50)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
