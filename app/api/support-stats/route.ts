import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      // Return default stats for demo/unauthenticated mode (no error, just empty stats)
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0,
        demo: true
      })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get("userId")

    // Users can only see their own stats
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0
      })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      // Return default stats when database not configured
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0,
        dbConfigured: false
      })
    }

    // Try to get stats, handle gracefully if table doesn't exist
    try {
      const { data: stats, error } = await supabase
        .from("support_stats")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (error || !stats) {
        // Stats don't exist yet - return zeros
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
    } catch {
      // Table might not exist, return defaults
      return NextResponse.json({
        totalEarnings: 0,
        adsWatchedToday: 0,
        totalAdsWatched: 0
      })
    }

  } catch (error) {
    console.error("Support stats error:", error)
    return NextResponse.json({
      totalEarnings: 0,
      adsWatchedToday: 0,
      totalAdsWatched: 0
    })
  }
}
