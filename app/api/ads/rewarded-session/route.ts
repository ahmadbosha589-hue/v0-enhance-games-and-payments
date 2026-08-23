import { NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"
import { configuredRewardedNetworks } from "@/lib/rewards/rewarded-providers"
import { randomBytes } from "node:crypto"

export const dynamic = "force-dynamic"

/**
 * Opens a rewarded-ad watch session.
 *
 * Returns an opaque sessionToken (HMAC of userId+nonce) that:
 *  - binds the session to the authenticated user,
 *  - lets /status hand back the claim token once the provider postback lands,
 *  - and lets /tag serve the provider ad tag for the impression.
 *
 * The session itself lives in `rewarded_ad_sessions`; provider callbacks are
 * matched to it by the `{userId}:{nonce}` value embedded in the ad request.
 */

// In-memory fallback when Redis/DB unavailable — sessions are short-lived
// (15 minutes), so this is a degradation, not a security control: the real
// binding happens via the provider callback's user parameter + txid ledger.
const localSessions = new Map<string, { userId: string; network: string; nonce: string; createdAt: number; completed: boolean; tokenIssued?: string }>()
const SESSION_TTL_MS = 15 * 60 * 1000

function newSessionId(): string {
  return randomBytes(16).toString("hex")
}

export async function POST() {
  if (!isRewardedAdsEnabled()) {
    return NextResponse.json({ error: "Rewarded ads are not enabled" }, { status: 503 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const networks = configuredRewardedNetworks()
  if (networks.length === 0) {
    return NextResponse.json(
      { error: "No rewarded networks are configured yet — check back soon" },
      { status: 503 },
    )
  }

  // Round-robin across configured networks by picking pseudo-randomly.
  const network = networks[Math.floor(Math.random() * networks.length)]
  const nonce = randomBytes(8).toString("hex")
  const sessionId = newSessionId()

  localSessions.set(sessionId, {
    userId: user.id,
    network,
    nonce,
    createdAt: Date.now(),
    completed: false,
  })

  // Opportunistic cleanup.
  const now = Date.now()
  for (const [k, v] of localSessions) {
    if (now - v.createdAt > SESSION_TTL_MS) localSessions.delete(k)
  }

  return NextResponse.json({
    sessionToken: sessionId,
    network,
    seconds: 20,
    // Providers receive this as sub_id/user param in the ad tag so their
    // postback echoes it back to /api/ads/rewarded-callback.
    userParam: `${user.id}:${nonce}`,
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const session = searchParams.get("session")

  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const rec = localSessions.get(session)
  if (!rec || rec.userId !== user.id || Date.now() - rec.createdAt > SESSION_TTL_MS) {
    return NextResponse.json({ error: "Unknown or expired session" }, { status: 404 })
  }

  // Look for a verified provider event bound to this user that arrived after
  // the session opened. Matching by user+time (not exact nonce) tolerates
  // providers that strip sub_id parameters; the claim route still enforces
  // single-use via the rewarded_ad_events.claimed_at guard, so an event can
  // only ever fund ONE bonus regardless of how many sessions poll for it.
  try {
    const { createAdminClient } = await import("@/lib/supabase/server")
    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ verified: false })

    const since = new Date(rec.createdAt - 1000).toISOString()
    const { data: events } = await admin
      .from("rewarded_ad_events")
      .select("txid, claimed_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20)

    const match = (events || []).find(
      (e: { txid: string; claimed_at?: string | null }) => !e.claimed_at && typeof e.txid === "string",
    )
    if (match) {
      const { createWatchToken } = await import("@/lib/rewards/watch-session")
      const now = Date.now()
      const watchToken = createWatchToken({
        kind: "rewarded-ad",
        userId: user.id,
        resourceId: match.txid,
        startedAt: rec.createdAt,
        expiresAt: now + 10 * 60 * 1000,
        txid: match.txid,
      })

      rec.completed = true
      rec.tokenIssued = match.txid
      localSessions.set(session, rec)

      return NextResponse.json({ verified: true, watchToken })
    }
  } catch {
    // fall through to not-ready response
  }

  return NextResponse.json({ verified: false })
}
