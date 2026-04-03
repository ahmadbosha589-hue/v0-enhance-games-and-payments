import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get("userId")

    // Users can only see their own stats
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0
      })
    }

    const { data: stats, error } = await supabase
      .from("support_stats")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (error || !stats) {
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0
      })
    }

    // Check if it's a new day and reset daily count
    const today = new Date().toISOString().split("T")[0]
    const lastUpdate = stats.updated_at ? new Date(stats.updated_at).toISOString().split("T")[0] : null

    const adsWatchedToday = lastUpdate === today ? (stats.ads_watched_today || 0) : 0

    return NextResponse.json({
      totalEarnings: stats.total_support_earnings || 0,
      adsWatchedToday,
      totalAdsWatched: stats.total_ads_watched || 0,
      lastUpdated: stats.updated_at
    })

  } catch (error) {
    console.error("Support stats error:", error)
    return NextResponse.json({
      totalEarnings: 0,
      adsWatchedToday: 0,
      totalAdsWatched: 0
    })
  }
}
