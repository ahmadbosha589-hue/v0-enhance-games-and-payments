export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = createAdminClient()

    if (!db) {
      console.error("[shortlinks/visits] Admin client not available")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Load today's visits
    const { data: visitsData, error: visitsError } = await db
      .from("shortlink_views")
      .select("shortlink_id, reward_satoshis")
      .eq("user_id", user.id)
      .gte("viewed_at", today.toISOString())

    if (visitsError) {
      console.error("[shortlinks/visits] DB error:", visitsError)
      return NextResponse.json({ error: visitsError.message }, { status: 500 })
    }

    // Load recent visits with shortlink titles
    const { data: recentData, error: recentError } = await db
      .from("shortlink_views")
      .select(`
        id,
        shortlink_id,
        viewed_at,
        reward_satoshis,
        shortlinks (title)
      `)
      .eq("user_id", user.id)
      .order("viewed_at", { ascending: false })
      .limit(5)

    if (recentError) {
      console.error("[shortlinks/visits] Recent visits error:", recentError)
    }

    return NextResponse.json({
      todayVisits: visitsData ?? [],
      recentVisits: recentData ?? []
    })
  } catch (err) {
    console.error("[shortlinks/visits] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
