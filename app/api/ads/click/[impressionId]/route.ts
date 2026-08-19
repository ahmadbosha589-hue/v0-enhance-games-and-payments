import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit, RATE_LIMITS } from "@/lib/redis/rate-limiter"
import { getConsentMarketing, getDeviceClass, getViewerHash } from "@/lib/ads/viewer-hash"
import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"

export const runtime = "nodejs"
export const maxDuration = 5

const impressionSchema = z.coerce.number().int().positive().safeParse

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ impressionId: string }> },
) {
  if (!getConsentMarketing(request)) return new NextResponse(null, { status: 204 })

  const { impressionId: rawId } = await params
  const parsedId = impressionSchema(rawId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid impression" }, { status: 400 })

  const viewerHash = getViewerHash(request)
  if (!viewerHash) return NextResponse.json({ error: "Click tracking unavailable" }, { status: 503 })

  const rate = await checkRateLimit(`click:${viewerHash}`, {
    ...RATE_LIMITS.API_GENERAL,
    limit: 20,
    prefix: "rl:ads:click",
  })
  if (!rate.success) {
    return NextResponse.json({ error: "Too many clicks" }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfter || 60) },
    })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })

  const { data, error } = await admin.rpc("record_ad_click", {
    p_impression_id: parsedId.data,
    p_viewer_hash: viewerHash,
    p_country: request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() || null,
    p_device: getDeviceClass(request.headers.get("user-agent")),
  })

  if (error) {
    console.error("[Ads] record_ad_click RPC failed:", error.message)
    return NextResponse.json({ error: "Click unavailable" }, { status: 503 })
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.target_url || !isSafeTargetUrl(row.target_url)) {
    return NextResponse.json({ error: "Invalid campaign target" }, { status: 410 })
  }

  return NextResponse.redirect(row.target_url, {
    status: 302,
    headers: { "Referrer-Policy": "no-referrer" },
  })
}
