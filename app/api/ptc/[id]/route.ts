import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { createWatchToken } from "@/lib/rewards/watch-session"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "PTC ads are temporarily unavailable" }, { status: 503 })
    }

    const { data: ad, error } = await adminSupabase
      .from("ptc_ads")
      .select("id, title, description, url, duration_seconds, reward_satoshis, start_date, end_date")
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_approved", true)
      .gt("remaining_budget_satoshis", 0)
      .lte("start_date", new Date().toISOString())
      .or(`end_date.is.null,end_date.gt.${new Date().toISOString()}`)
      .single()

    if (error || !ad) {
      return NextResponse.json({ error: "Ad not found or no longer available" }, { status: 404 })
    }

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const { data: existingView } = await adminSupabase
      .from("ptc_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("ad_id", id)
      .gte("created_at", today.toISOString())
      .maybeSingle()

    if (existingView) {
      return NextResponse.json({ error: "You already watched this ad today" }, { status: 400 })
    }

    const now = Date.now()
    let watchToken: string
    try {
      watchToken = createWatchToken({
        kind: "ptc",
        userId: user.id,
        resourceId: id,
        startedAt: now,
        expiresAt: now + Math.max(30 * 60 * 1000, Number(ad.duration_seconds) * 1000 + 5 * 60 * 1000),
      })
    } catch (tokenError) {
      console.error("Failed to create PTC watch session:", tokenError)
      return NextResponse.json({ error: "PTC rewards are temporarily unavailable" }, { status: 503 })
    }

    return NextResponse.json({ ad, watchToken, watchStartedAt: now })
  } catch (error) {
    console.error("Error fetching PTC ad:", error)
    return NextResponse.json({ error: "PTC ads are temporarily unavailable" }, { status: 503 })
  }
}
