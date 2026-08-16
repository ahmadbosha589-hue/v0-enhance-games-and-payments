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

export function generateTOTP(secret: string, timeStep = 30): string {
  const counter = Math.floor(Date.now() / 1000 / timeStep)
  return generateHOTP(secret, counter)
}

export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const timeStep = 30
  const counter = Math.floor(Date.now() / 1000 / timeStep)

  // Check current time step and window around it
  for (let i = -window; i <= window; i++) {
    const expectedToken = generateHOTP(secret, counter + i)
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
      return true
    }
  }

  return false
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

export function verifyBackupCode(code: string, hashedCodes: string[]): { valid: boolean; index: number } {
  const normalized = code.replace(/-/g, "").toUpperCase()
  const hashedInput = crypto.createHash("sha256").update(normalized).digest("hex")

  const index = hashedCodes.findIndex((hashed) => crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(hashedInput)))

  return { valid: index !== -1, index }
}

export function generateTOTPUri(secret: string, email: string, issuer = "Faucero"): string {
  const encodedIssuer = encodeURIComponent(issuer)
  const encodedEmail = encodeURIComponent(email)
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`
}
