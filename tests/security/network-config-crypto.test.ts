import crypto from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { decryptNetworkConfig, encryptNetworkConfig, parseNetworkConfig } from "@/lib/ads/network-config-crypto"

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

function setTestKey() {
  process.env.ENCRYPTION_KEY = "test-only-ad-config-key"
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY
})

describe("network config crypto", () => {
  it("round-trips new values with authenticated AES-GCM", () => {
    setTestKey()
    const plaintext = JSON.stringify({ apiKey: "redacted-test-value", zoneId: "zone-1" })
    const encrypted = encryptNetworkConfig(plaintext)

    expect(encrypted.startsWith("v2:")).toBe(true)
    expect(decryptNetworkConfig(encrypted)).toBe(plaintext)
    expect(parseNetworkConfig(decryptNetworkConfig(encrypted))).toEqual({
      apiKey: "redacted-test-value",
      zoneId: "zone-1",
    })
  })

  it("rejects a tampered authenticated ciphertext", () => {
    setTestKey()
    const encrypted = encryptNetworkConfig("sensitive config")
    const parts = encrypted.split(":")
    const last = parts[parts.length - 1]
    if (!last) throw new Error("missing ciphertext")
    parts[parts.length - 1] = `${last.slice(0, -2)}${last.endsWith("00") ? "ff" : "00"}`

    expect(decryptNetworkConfig(parts.join(":"))).toBeNull()
  })

  it("still reads legacy CBC values made with the explicit key", () => {
    setTestKey()
    const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY!, "utf8").digest()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
    const ciphertext = Buffer.concat([cipher.update("legacy config", "utf8"), cipher.final()])
    const legacy = `${iv.toString("hex")}:${ciphertext.toString("hex")}`

    expect(decryptNetworkConfig(legacy)).toBe("legacy config")
  })

  it("fails closed when the encryption key is absent", () => {
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptNetworkConfig("secret")).toThrow("ENCRYPTION_KEY is required")
    expect(decryptNetworkConfig("v2:00:00:00")).toBeNull()
  })
})
