import crypto from "crypto"

/**
 * Authenticated encryption for `ad_network_configs.encrypted_config`.
 *
 * New values use AES-256-GCM:
 *   v2:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>
 *
 * Legacy AES-256-CBC values (`<iv-hex>:<ciphertext-hex>`) remain readable when
 * the same explicit ENCRYPTION_KEY is available, so existing rows can be
 * migrated on the next admin save. CBC values are never emitted again.
 */
const VERSION = "v2"
const GCM_IV_LENGTH = 12
const CBC_IV_LENGTH = 16

function legacyKeyBuffer(): Buffer {
  const configured = process.env.ENCRYPTION_KEY?.trim()
  if (!configured) {
    throw new Error("ENCRYPTION_KEY is required to decrypt legacy ad network configuration")
  }
  return Buffer.from(configured.padEnd(32).slice(0, 32))
}

function keyBuffer(): Buffer {
  const configured = process.env.ENCRYPTION_KEY?.trim()
  if (!configured) {
    throw new Error("ENCRYPTION_KEY is required to encrypt or decrypt ad network configuration")
  }
  return crypto.createHash("sha256").update(configured, "utf8").digest()
}

export function encryptNetworkConfig(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer(), iv)
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":")
}

export function decryptNetworkConfig(text: string): string | null {
  try {
    const parts = text.split(":")

    if (parts[0] === VERSION) {
      const [, ivHex, authTagHex, ciphertextHex] = parts
      if (!ivHex || !authTagHex || !ciphertextHex) return null

      const iv = Buffer.from(ivHex, "hex")
      const authTag = Buffer.from(authTagHex, "hex")
      if (iv.length !== GCM_IV_LENGTH || authTag.length !== 16) return null

      const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer(), iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, "hex")),
        decipher.final(),
      ]).toString("utf8")
    }

    // Backward-compatible reader for values written by the old CBC code.
    if (parts.length === 2) {
      const [ivHex, ciphertextHex] = parts
      if (!ivHex || !ciphertextHex) return null

      const iv = Buffer.from(ivHex, "hex")
      if (iv.length !== CBC_IV_LENGTH) return null

      const decipher = crypto.createDecipheriv("aes-256-cbc", legacyKeyBuffer(), iv)
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, "hex")),
        decipher.final(),
      ]).toString("utf8")
    }

    return null
  } catch {
    // Missing/rotated key, malformed input, and GCM authentication failures
    // all mean the public config route must treat the network as unavailable.
    return null
  }
}

/** Parses a decrypted JSON config blob, returning {} on any failure. */
export function parseNetworkConfig(decrypted: string | null): Record<string, unknown> {
  if (!decrypted) return {}
  try {
    const parsed = JSON.parse(decrypted)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}
