import { NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { createWatchToken } from "@/lib/rewards/watch-session"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = requireAdminClient()

    // Get the specific shortlink
    const { data: shortlink, error } = await adminSupabase
      .from("shortlinks")
      .select("id, title, destination_url, reward_satoshis, view_time_seconds")
      .eq("id", id)
      .eq("is_active", true)
      .single()

    if (error || !shortlink) {
      return NextResponse.json({ error: "Shortlink not found or no longer available" }, { status: 404 })
    }

    // Check if user already visited this shortlink today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const { data: existingVisit } = await adminSupabase
      .from("shortlink_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("shortlink_id", id)
      .gte("viewed_at", today.toISOString())
      .single()

    if (existingVisit) {
      return NextResponse.json({ error: "You already visited this shortlink today" }, { status: 400 })
    }

    const now = Date.now()
    let watchToken: string
    try {
      watchToken = createWatchToken({
        kind: "shortlink",
        userId: user.id,
        resourceId: id,
        startedAt: now,
        expiresAt: now + Math.max(15 * 60 * 1000, Number(shortlink.view_time_seconds) * 1000 + 60_000),
      })
    } catch (tokenError) {
      console.error("Failed to create shortlink watch session:", tokenError)
      return NextResponse.json({ error: "Shortlink rewards are temporarily unavailable" }, { status: 503 })
    }

    return NextResponse.json({
      shortlink,
      watchToken,
      watchStartedAt: now,
    })
  } catch (error) {
    console.error("Error fetching shortlink:", error)
    return NextResponse.json({ error: "Failed to fetch shortlink" }, { status: 500 })
  }
}
