import { z } from "zod"
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit, RATE_LIMITS } from "@/lib/redis/rate-limiter"
import { getConsentMarketing, getDeviceClass, getViewerHash } from "@/lib/ads/viewer-hash"
import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"

export const runtime = "nodejs"
export const maxDuration = 5

const requestSchema = z.object({
  slot: z.string().trim().min(1).max(80),
  channel: z.string().trim().min(1).max(80),
})

function noContent() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!getConsentMarketing(request)) return noContent()

  const viewerHash = getViewerHash(request)
  if (!viewerHash) return noContent()

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ad serve request" }, { status: 400 })
  }

  const rate = await checkRateLimit(`serve:${viewerHash}`, {
    ...RATE_LIMITS.API_GENERAL,
    limit: 30,
    prefix: "rl:ads:serve",
  })
  if (!rate.success) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(rate.retryAfter || 60),
      },
    })
  }

  const admin = createAdminClient()
  if (!admin) return noContent()

  const country = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() || null
  const device = getDeviceClass(request.headers.get("user-agent"))

  const { data, error } = await admin.rpc("serve_ad", {
    p_slot: parsed.data.slot,
    p_channel: parsed.data.channel,
    p_country: country,
    p_device: device,
    p_viewer_hash: viewerHash,
  })

  if (error) {
    console.error("[Ads] serve_ad RPC failed:", error.message)
    return noContent()
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.campaign_id || !row.creative_url || !row.target_url) return noContent()
  if (!isSafeTargetUrl(row.creative_url) || !isSafeTargetUrl(row.target_url)) return noContent()

  return NextResponse.json({
    campaignId: row.campaign_id,
    title: row.title,
    description: row.description,
    creativeUrl: row.creative_url,
    clickUrl: `/api/ads/click/${encodeURIComponent(String(row.impression_id))}`,
    impressionId: row.impression_id,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}
