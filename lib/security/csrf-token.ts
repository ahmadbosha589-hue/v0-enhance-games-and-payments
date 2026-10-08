import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const TOKEN_VALUE_BYTES = 32
const TOKEN_TTL_MS = 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 30_000
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i

function assertStrongSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("CSRF signing secret must contain at least 32 UTF-8 bytes")
  }
}

/** Create a random, HMAC-signed double-submit token. */
export function generateSignedCSRFToken(secret: string, nowMs = Date.now()): string {
  assertStrongSecret(secret)
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("CSRF token timestamp must be a non-negative safe integer")
  }

  const value = randomBytes(TOKEN_VALUE_BYTES).toString("hex")
  const timestamp = String(nowMs)
  const signature = createHmac("sha256", secret).update(`${value}:${timestamp}`).digest("hex")
  return `${value}:${timestamp}:${signature}`
}

/**
 * Validate token shape, age and HMAC. Malformed, expired, future-dated,
 * or weak-key tokens are rejected; the signature comparison is constant-time.
 */
export function validateSignedCSRFToken(token: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!token || token.length > 160 || Buffer.byteLength(secret, "utf8") < 32) return false
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false

  const parts = token.split(":")
  if (parts.length !== 3) return false

  const [value, timestamp, signature] = parts
  if (!TOKEN_PATTERN.test(value) || !/^\d{13}$/.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) {
    return false
  }

  const issuedAt = Number(timestamp)
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowMs + MAX_FUTURE_SKEW_MS || nowMs - issuedAt > TOKEN_TTL_MS) {
    return false
  }

  const expected = createHmac("sha256", secret).update(`${value}:${timestamp}`).digest()
  const actual = Buffer.from(signature, "hex")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
