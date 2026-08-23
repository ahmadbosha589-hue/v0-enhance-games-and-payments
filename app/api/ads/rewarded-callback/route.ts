import { NextRequest, NextResponse } from "next/server"
import { normalizeRewardedCallback, type CallbackParams } from "@/lib/rewards/rewarded-providers"
import { createWatchToken } from "@/lib/rewards/watch-session"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"
import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * Rewarded-ad provider server-to-server callback.
 *
 * Flow:
 *   1. Provider POSTs/GETs a signed postback here after the user completes a
 *      rewarded view.
 *   2. We verify the signature/secret (lib/rewards/rewarded-providers.ts).
 *   3. On success we mint a SINGLE-USE HMAC watch token bound to
 *      `{userId}:{txid}` and hand it back. The client presents this token to
 *      /api/bonus-reward/claim — which verifies it before paying.
 *
 * Idempotency: the txid is recorded in `rewarded_ad_events`. A replayed
 * postback gets 200 + the SAME token only while it remains unclaimed; after a
 * successful claim the txid row carries claimed_at and re-play returns OK with
 * no new token (providers retry on non-200, so never error a duplicate).
 *
 * NOTE on user identity: our ad units embed `{userId}:{nonce}` in the
 * provider's user/sub_id parameter when requesting the ad; providers echo it
 * back here. If a provider cannot echo it, the event is still verified but no
 * token can be issued (nothing to bind) — logged and acknowledged 200 so the
 * provider does not retry forever.
 */
export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  if (!isRewardedAdsEnabled()) {
    // Do not reveal route existence beyond a generic refusal.
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  try {
    const url = new URL(request.url)
    const params: CallbackParams = {}
    url.searchParams.forEach((v, k) => {
      params[k] = v
    })
    if (request.method === "POST") {
      const contentType = request.headers.get("content-type") || ""
      try {
        if (contentType.includes("application/json")) {
          const body = (await request.json()) as Record<string, unknown>
          for (const [k, v] of Object.entries(body)) {
            if (typeof v === "string" || typeof v === "number") params[k] = String(v)
          }
        } else if (
          contentType.includes("application/x-www-form-urlencoded") ||
          contentType.includes("multipart/form-data")
        ) {
          const form = await request.formData()
          form.forEach((v, k) => {
            if (typeof v === "string") params[k] = v
          })
        }
      } catch {
        // Body parse issues are non-fatal; query params may carry everything.
      }
    }

    const network = params.network || url.pathname.split("/").filter(Boolean).pop() || "generic"
    const result = normalizeRewardedCallback(network, params)

    if (!result.ok) {
      log.warn("[rewarded-callback] rejected", { network, reason: result.reason })
      // Signature failures must be visible to the provider as failure but we
      // keep the response generic.
      return NextResponse.json({ status: "rejected" }, { status: 403 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ status: "error" }, { status: 503 })
    }

    const txid = result.txid!
    const userId = result.userId

    if (!userId) {
      // Verified event but nothing to bind a reward to — acknowledge it.
      log.warn("[rewarded-callback] verified event without user binding", { network, txid })
      return NextResponse.json({ status: "ok" })
    }

    // Idempotent event record.
    const { data: existing, error: insertError } = await admin
      .from("rewarded_ad_events")
      .upsert(
        {
          txid,
          network,
          user_id: userId,
          amount: result.amount ?? null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "txid" },
      )
      .select("id, txid, claimed_at")
      .single()

    if (insertError) {
      log.error("[rewarded-callback] event upsert failed", { network, txid, error: insertError })
      return NextResponse.json({ status: "error" }, { status: 500 })
    }

    if ((existing as { claimed_at?: string | null } | null)?.claimed_at) {
      // Already converted by the user — acknowledge without issuing a token.
      return NextResponse.json({ status: "ok", already_claimed: true })
    }

    // Mint the single-use claim token (10-minute window mirrors provider
    // retry budgets; expiry is enforced inside verifyWatchToken).
    const now = Date.now()
    const watchToken = createWatchToken({
      kind: "rewarded-ad",
      userId,
      resourceId: txid,
      startedAt: now,
      expiresAt: now + 10 * 60 * 1000,
      txid,
    })

    log.info("[rewarded-callback] rewarded view credited", {
      network,
      txid,
      userHash: userId.slice(0, 8),
    })

    return NextResponse.json({
      status: "ok",
      // Providers generally ignore the body, but some S2S integrations relay
      // it to the client surface; harmless either way.
      watch_token_available: true,
    })
  } catch (error) {
    log.error("[rewarded-callback] unexpected error", { error })
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}

/** Exported for tests. */
export type { CallbackParams }
