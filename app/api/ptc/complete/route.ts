import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { verifyWatchToken } from "@/lib/rewards/watch-session"
import { recordTournamentEarning } from "@/lib/rewards/tournament-score"

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { adId, watchToken, fingerprint } = body
    if (!adId || typeof adId !== "string" || !watchToken || typeof watchToken !== "string") {
      return NextResponse.json({ error: "Missing required watch session" }, { status: 400 })
    }
    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 10 || fingerprint.length > 200) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "PTC rewards are temporarily unavailable" }, { status: 503 })
    }

    const now = new Date().toISOString()
    const { data: ad, error: adError } = await adminSupabase
      .from("ptc_ads")
      .select("id, duration_seconds, is_active, is_approved, remaining_budget_satoshis, start_date, end_date")
      .eq("id", adId)
      .eq("is_active", true)
      .eq("is_approved", true)
      .gt("remaining_budget_satoshis", 0)
      .lte("start_date", now)
      .or(`end_date.is.null,end_date.gt.${now}`)
      .single()

    if (adError || !ad) {
      return NextResponse.json({ error: "Ad not found or expired" }, { status: 404 })
    }

    let session
    try {
      session = verifyWatchToken(watchToken, {
        kind: "ptc",
        userId: user.id,
        resourceId: adId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid watch session"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "unknown"
    const userAgent = headersList.get("user-agent") || "unknown"

    const { data: result, error: completionError } = await adminSupabase.rpc("complete_ptc_view", {
      p_user_id: user.id,
      p_ad_id: adId,
      p_started_at: new Date(session.startedAt).toISOString(),
      p_ip_address: ip,
      p_user_agent: userAgent,
    })

    if (completionError) {
      console.error("PTC atomic completion failed:", completionError)
      return NextResponse.json({ error: "PTC reward service is temporarily unavailable" }, { status: 503 })
    }

    if (!result?.success) {
      const status = result?.error === "ALREADY_COMPLETED" || result?.error === "WATCH_TOO_SHORT" ? 400 : 503
      return NextResponse.json({ error: result?.message || "Unable to complete PTC ad" }, { status })
    }

    // Tournament scoring (fire-and-forget, non-fatal): PTC earnings feed
    // highest_earners daily/weekly/monthly.
    await recordTournamentEarning(adminSupabase, user.id, "earning", result.reward ?? 0)

    return NextResponse.json({
      success: true,
      reward: result.reward,
      newBalance: result.new_balance,
      viewId: result.view_id,
    })
  } catch (error) {
    console.error("PTC complete error:", error)
    return NextResponse.json({ error: "PTC reward service is temporarily unavailable" }, { status: 503 })
  }
}
