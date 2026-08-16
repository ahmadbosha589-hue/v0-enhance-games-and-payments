import crypto from "crypto"

/**
 * Shared AES-256-CBC encrypt/decrypt for `ad_network_configs.encrypted_config`.
 *
 * Previously this logic only existed inline in
 * `app/api/admin/ad-networks/route.ts` (used to WRITE the encrypted blob).
 * Nothing ever decrypted it back — `app/api/ads/config/route.ts` (the
 * PUBLIC route the ad slot components call to know which networks are
 * enabled) read `config.settings`, a column that has never existed on
 * `ad_network_configs` (the table only has `encrypted_config`). So any
 * network an admin configured through Admin → Ads → Networks (as opposed
 * to env vars) was saved correctly but silently never applied on the
 * actual site — `AdSlotMultiNetwork` / `MultiNetworkAds` would only ever
 * see the network as disabled. This module + the fix in
 * `app/api/ads/config/route.ts` closes that gap.
 */
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
  "default-key-must-be-32-chars!!"
const IV_LENGTH = 16

function keyBuffer(): Buffer {
  return Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32))
}

export function encryptNetworkConfig(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

export function decryptNetworkConfig(text: string): string | null {
  try {
    const [ivHex, encryptedText] = text.split(":")
    if (!ivHex || !encryptedText) return null
    const iv = Buffer.from(ivHex, "hex")
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer(), iv)
    let decrypted = decipher.update(encryptedText, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch {
    // Wrong key (e.g. ENCRYPTION_KEY rotated) or corrupted blob — treat as
    // "not configured" rather than crashing the public config endpoint.
    return null
  }
}

/** Parses a decrypted JSON config blob, returning {} on any failure. */
export function parseNetworkConfig(decrypted: string | null): Record<string, unknown> {
  if (!decrypted) return {}
  try {
    const parsed = JSON.parse(decrypted)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}
