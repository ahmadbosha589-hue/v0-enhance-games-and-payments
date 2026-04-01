"use server"

import crypto from "crypto"

// Character set excluding ambiguous characters (0, O, I, 1, L)
const SECURE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 12

/**
 * Generates a cryptographically secure 12-character coupon code
 * Uses crypto.randomBytes for true randomness
 * Character set excludes ambiguous chars (0/O, 1/I/L) for readability
 */
export function generateSecureCouponCode(): string {
  const randomBytes = crypto.randomBytes(CODE_LENGTH)
  let code = ""

  for (let i = 0; i < CODE_LENGTH; i++) {
    // Use modulo to map byte to character set
    const index = randomBytes[i] % SECURE_CHARS.length
    code += SECURE_CHARS[index]
  }

  return code
}

/**
 * Generates multiple unique coupon codes
 * Ensures no duplicates in the batch
 */
export function generateSecureCouponCodes(count: number): string[] {
  const codes = new Set<string>()

  while (codes.size < count) {
    codes.add(generateSecureCouponCode())
  }

  return Array.from(codes)
}

/**
 * Validates a coupon code format
 * Must be exactly 12 characters, uppercase alphanumeric (excluding ambiguous chars)
 */
export function isValidCouponCodeFormat(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false

  const validCharsRegex = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/
  return validCharsRegex.test(code.toUpperCase())
}

/**
 * Generates a coupon code with checksum for additional validation
 * Last 2 characters are a checksum of the first 10
 */
export function generateSecureCouponCodeWithChecksum(): string {
  const baseLength = CODE_LENGTH - 2
  const randomBytes = crypto.randomBytes(baseLength)
  let code = ""

  for (let i = 0; i < baseLength; i++) {
    const index = randomBytes[i] % SECURE_CHARS.length
    code += SECURE_CHARS[index]
  }

  // Calculate checksum from first 10 characters
  const checksum = calculateChecksum(code)
  return code + checksum
}

/**
 * Calculates a 2-character checksum for a code
 */
function calculateChecksum(code: string): string {
  let sum = 0
  for (let i = 0; i < code.length; i++) {
    sum += code.charCodeAt(i) * (i + 1)
  }

  const char1 = SECURE_CHARS[sum % SECURE_CHARS.length]
  const char2 = SECURE_CHARS[(sum * 7) % SECURE_CHARS.length]

  return char1 + char2
}

/**
 * Validates a coupon code with checksum
 */
export function validateCouponCodeChecksum(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false

  const baseCode = code.substring(0, CODE_LENGTH - 2)
  const providedChecksum = code.substring(CODE_LENGTH - 2)
  const calculatedChecksum = calculateChecksum(baseCode)

  return providedChecksum === calculatedChecksum
}

/**
 * Generates a batch of secure coupon codes for admin panel
 */
export async function generateCouponBatch(
  count: number,
  options: {
    description: string
    rewardSatoshis: number
    maxUsesPerCode: number
    expiresInDays: number
    withChecksum?: boolean
  }
): Promise<{
  codes: string[]
  sqlInsert: string
}> {
  const generator = options.withChecksum
    ? generateSecureCouponCodeWithChecksum
    : generateSecureCouponCode

  const codes: string[] = []
  const codesSet = new Set<string>()

  while (codesSet.size < count) {
    const code = generator()
    if (!codesSet.has(code)) {
      codesSet.add(code)
      codes.push(code)
    }
  }

  // Generate SQL insert statement
  const expiresAt = `NOW() + INTERVAL '${options.expiresInDays} days'`
  const values = codes
    .map(
      (code) =>
        `('${code}', '${options.description.replace(/'/g, "''")}', ${options.rewardSatoshis}, ${options.maxUsesPerCode}, ${options.maxUsesPerCode}, ${expiresAt}, true, false)`
    )
    .join(",\n")

  const sqlInsert = `INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES\n${values}\nON CONFLICT DO NOTHING;`

  return { codes, sqlInsert }
}

/**
 * Entropy calculation for the code
 * 12 characters from 32-character set = ~60 bits of entropy
 */
export function getCodeEntropy(): {
  bitsOfEntropy: number
  possibleCombinations: string
  bruteForceTime: string
} {
  const charsetSize = SECURE_CHARS.length // 32
  const bitsOfEntropy = Math.log2(Math.pow(charsetSize, CODE_LENGTH))
  const possibleCombinations = Math.pow(charsetSize, CODE_LENGTH)

  // Assuming 1 billion attempts per second
  const secondsToBruteForce = possibleCombinations / 1e9
  const yearsToBruteForce = secondsToBruteForce / (60 * 60 * 24 * 365)

  return {
    bitsOfEntropy: Math.round(bitsOfEntropy * 100) / 100,
    possibleCombinations: possibleCombinations.toExponential(2),
    bruteForceTime:
      yearsToBruteForce > 1000
        ? `${(yearsToBruteForce / 1000).toFixed(0)} thousand years`
        : yearsToBruteForce > 1
          ? `${yearsToBruteForce.toFixed(0)} years`
          : `${(secondsToBruteForce / 3600).toFixed(0)} hours`,
  }
}
