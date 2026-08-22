import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export type WatchSessionKind = "shortlink" | "ptc" | "rewarded-ad"

export interface WatchSessionPayload {
  version: 1
  kind: WatchSessionKind
  userId: string
  resourceId: string
  startedAt: number
  expiresAt: number
  nonce: string
  /**
   * For `kind: "rewarded-ad"` tokens only: the provider transaction id the
   * reward was issued for. Bound into the HMAC so a token cannot be replayed
   * against a different conversion row.
   */
  txid?: string
}

interface WatchSessionExpectation {
  kind: WatchSessionKind
  userId: string
  resourceId: string
  now?: number
}

const CLOCK_SKEW_MS = 30_000

function getSecret(): string {
  const secret = process.env.REWARD_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) {
    throw new Error("Reward watch sessions are not configured")
  }
  return secret
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8")
}

function sign(body: string): string {
  return createHmac("sha256", getSecret()).update(body).digest("base64url")
}

export function createWatchToken(input: Omit<WatchSessionPayload, "version" | "nonce">): string {
  if (!input.userId || !input.resourceId || !Number.isFinite(input.startedAt) || !Number.isFinite(input.expiresAt)) {
    throw new Error("Invalid reward watch session")
  }
  if (input.expiresAt <= input.startedAt) {
    throw new Error("Reward watch session expiry must be after its start")
  }

  const payload: WatchSessionPayload = {
    version: 1,
    ...input,
    nonce: randomBytes(16).toString("hex"),
  }
  const body = encode(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function verifyWatchToken(token: string, expectation: WatchSessionExpectation): WatchSessionPayload {
  const [body, receivedSignature, extra] = token.split(".")
  if (!body || !receivedSignature || extra) throw new Error("Invalid reward watch token")

  const expectedSignature = sign(body)
  const received = Buffer.from(receivedSignature, "base64url")
  const expected = Buffer.from(expectedSignature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Invalid reward watch token signature")
  }

  let payload: WatchSessionPayload
  try {
    payload = JSON.parse(decode(body)) as WatchSessionPayload
  } catch {
    throw new Error("Invalid reward watch token payload")
  }

  const now = expectation.now ?? Date.now()
  if (payload.version !== 1 || payload.kind !== expectation.kind || payload.userId !== expectation.userId || payload.resourceId !== expectation.resourceId) {
    throw new Error("Reward watch session mismatch")
  }
  if (!Number.isFinite(payload.startedAt) || !Number.isFinite(payload.expiresAt) || payload.startedAt > now + CLOCK_SKEW_MS) {
    throw new Error("Invalid reward watch session timing")
  }
  if (now > payload.expiresAt) {
    throw new Error("Reward watch session expired")
  }

  return payload
}
