import crypto from "crypto"

// Base32 encoding/decoding utilities
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function generateBase32Secret(length = 20): string {
  const buffer = crypto.randomBytes(length)
  let result = ""
  for (let i = 0; i < buffer.length; i++) {
    result += BASE32_CHARS[buffer[i] % 32]
  }
  return result
}

function base32ToBuffer(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, "")
  const bits: number[] = []

  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char)
    if (val === -1) continue
    bits.push(...val.toString(2).padStart(5, "0").split("").map(Number))
  }

  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2))
  }

  return Buffer.from(bytes)
}

function generateHOTP(secret: string, counter: number): string {
  const secretBuffer = base32ToBuffer(secret)
  const counterBuffer = Buffer.alloc(8)

  // Write counter as big-endian 64-bit integer
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff
    counter = Math.floor(counter / 256)
  }

  const hmac = crypto.createHmac("sha1", secretBuffer)
  hmac.update(counterBuffer)
  const hash = hmac.digest()

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  return (code % 1000000).toString().padStart(6, "0")
}

/**
 * Constant-time string comparison that tolerates unequal lengths.
 *
 * crypto.timingSafeEqual() THROWS when the two buffers differ in length, so
 * calling it directly on user input was a crash: a 5-character TOTP code, or a
 * backup code of the wrong shape, produced an unhandled 500 instead of a clean
 * "invalid code". We compare lengths first (that fact is not secret — the code
 * format is public) and only then do the constant-time content comparison.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function generateTOTP(secret: string, timeStep = 30): string {
  const counter = Math.floor(Date.now() / 1000 / timeStep)
  return generateHOTP(secret, counter)
}

/**
 * Verify a TOTP code.
 *
 * Returns the matched time-step counter so the caller can persist it and reject
 * a replay of the same code inside its validity window (see
 * profiles.two_factor_last_step). Returning only a boolean made replay
 * detection impossible.
 */
export function verifyTOTPWithStep(
  secret: string,
  token: string,
  window = 1,
): { valid: boolean; step: number | null } {
  if (!/^\d{6}$/.test(token)) return { valid: false, step: null }

  const timeStep = 30
  const counter = Math.floor(Date.now() / 1000 / timeStep)

  for (let i = -window; i <= window; i++) {
    const expectedToken = generateHOTP(secret, counter + i)
    if (safeEqual(token, expectedToken)) {
      return { valid: true, step: counter + i }
    }
  }

  return { valid: false, step: null }
}

export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  return verifyTOTPWithStep(secret, token, window).valid
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase()
    // Format as XXXX-XXXX
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`)
  }
  return codes
}

export function hashBackupCode(code: string): string {
  const normalized = code.replace(/-/g, "").toUpperCase()
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

/**
 * Verify a backup code against the stored list.
 *
 * Storage format is sha256 hex (app/api/2fa/setup and
 * app/api/2fa/backup-codes both map generateBackupCodes() through
 * hashBackupCode() before persisting). Legacy plaintext entries are also
 * accepted defensively so any row written before that was true still redeems.
 *
 * Uses safeEqual() because crypto.timingSafeEqual() THROWS on a length
 * mismatch: passing a malformed code — or comparing a 64-char digest against a
 * 9-char plaintext row — crashed the route with a 500 instead of returning
 * "invalid code".
 */
export function verifyBackupCode(
  code: string,
  storedCodes: string[],
): { valid: boolean; index: number } {
  if (!code || !Array.isArray(storedCodes) || storedCodes.length === 0) {
    return { valid: false, index: -1 }
  }

  const normalized = code.replace(/-/g, "").toUpperCase()
  const hashedInput = crypto.createHash("sha256").update(normalized).digest("hex")

  const index = storedCodes.findIndex((stored) => {
    if (typeof stored !== "string" || !stored) return false
    // Hashed form (64 hex chars) — compare digests.
    if (/^[0-9a-f]{64}$/i.test(stored)) return safeEqual(stored.toLowerCase(), hashedInput)
    // Legacy plaintext form — normalize both sides before comparing.
    return safeEqual(stored.replace(/-/g, "").toUpperCase(), normalized)
  })

  return { valid: index !== -1, index }
}

export function generateTOTPUri(secret: string, email: string, issuer = "Faucero"): string {
  const encodedIssuer = encodeURIComponent(issuer)
  const encodedEmail = encodeURIComponent(email)
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`
}
