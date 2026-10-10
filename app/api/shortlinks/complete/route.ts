import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { verifyWatchToken } from "@/lib/rewards/watch-session"
import { recordTournamentEarning } from "@/lib/rewards/tournament-score"

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "unknown"
    const userAgent = headersList.get("user-agent") || "unknown"

    if (/bot|crawler|spider/i.test(userAgent)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { shortlinkId, watchToken, fingerprint } = body

    if (!shortlinkId || typeof shortlinkId !== "string" || !watchToken || typeof watchToken !== "string") {
      return NextResponse.json({ error: "Missing required watch session" }, { status: 400 })
    }
    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 10 || fingerprint.length > 200) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Shortlink rewards are temporarily unavailable" }, { status: 503 })
    }

    const { data: shortlink, error: shortlinkError } = await adminSupabase
      .from("shortlinks")
      .select("id, view_time_seconds, is_active")
      .eq("id", shortlinkId)
      .eq("is_active", true)
      .single()

    if (shortlinkError || !shortlink) {
      return NextResponse.json({ error: "Invalid shortlink" }, { status: 404 })
    }

    let session
    try {
      session = verifyWatchToken(watchToken, {
        kind: "shortlink",
        userId: user.id,
        resourceId: shortlinkId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid watch session"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const elapsedMs = Date.now() - session.startedAt
    const requiredMs = Math.max(0, Number(shortlink.view_time_seconds) * 1000 - 2000)
    if (elapsedMs < requiredMs) {
      return NextResponse.json({
        error: "Please view the link for the required time",
        required: shortlink.view_time_seconds,
        actual: Math.floor(elapsedMs / 1000),
      }, { status: 400 })
    }

    const { data: result, error: completionError } = await adminSupabase.rpc("complete_shortlink_view", {
      p_user_id: user.id,
      p_shortlink_id: shortlinkId,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_view_duration_ms: elapsedMs,
    })

    if (completionError) {
      console.error("[shortlinks/complete] atomic completion failed", completionError)
      return NextResponse.json({ error: "Shortlink reward service is temporarily unavailable" }, { status: 503 })
    }

    if (!result?.success) {
      const status = result?.error === "ALREADY_COMPLETED" || result?.error === "DAILY_LIMIT" ? 400 : 503
      return NextResponse.json({ error: result?.message || "Unable to complete shortlink" }, { status })
    }

    // Tournament scoring (fire-and-forget, non-fatal): shortlink earnings
    // feed highest_earners daily/weekly/monthly.
    await recordTournamentEarning(adminSupabase, user.id, "earning", result.reward ?? 0)

    return NextResponse.json({
      success: true,
      reward: result.reward,
      viewsToday: result.views_today,
      newBalance: result.new_balance,
    })
  } catch (error) {
    console.error("Shortlink complete error:", error)
    return NextResponse.json({ error: "Shortlink reward service is temporarily unavailable" }, { status: 503 })
  }
}
