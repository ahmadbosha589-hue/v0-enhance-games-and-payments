import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { headers } from "next/headers"

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"
    const userAgent = headersList.get("user-agent") || "unknown"

    // Bot detection
    if (userAgent.toLowerCase().includes("bot") ||
      userAgent.toLowerCase().includes("crawler")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await req.json()
    const { shortlinkId, viewStartTime, fingerprint } = body

    if (!shortlinkId || !viewStartTime || !fingerprint) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      console.error("[shortlinks/complete] Admin client not available")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find the shortlink
    const { data: shortlink, error: shortlinkError } = await adminSupabase
      .from("shortlinks")
      .select("*")
      .eq("id", shortlinkId)
      .eq("is_active", true)
      .single()

    if (shortlinkError || !shortlink) {
      return NextResponse.json({ error: "Invalid shortlink" }, { status: 404 })
    }

    // Check if user already viewed this shortlink today
    const { data: existingView } = await adminSupabase
      .from("shortlink_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("shortlink_id", shortlinkId)
      .gte("viewed_at", today.toISOString())
      .single()

    if (existingView) {
      return NextResponse.json({ error: "You have already viewed this shortlink today" }, { status: 400 })
    }

    // Validate view duration
    const viewDuration = Date.now() - viewStartTime
    const requiredDuration = shortlink.view_time_seconds * 1000

    // Allow 2 second grace period
    if (viewDuration < requiredDuration - 2000) {
      return NextResponse.json({
        error: "Please view the link for the required time",
        required: shortlink.view_time_seconds,
        actual: Math.floor(viewDuration / 1000)
      }, { status: 400 })
    }

    // Record the view — only columns that exist in shortlink_views schema
    const { error: viewError } = await adminSupabase
      .from("shortlink_views")
      .insert({
        user_id: user.id,
        shortlink_id: shortlinkId,
        reward_satoshis: shortlink.reward_satoshis,
        ip_address: ip
      })

    if (viewError) {
      console.error("Error recording shortlink view:", viewError)
      return NextResponse.json({ error: "Failed to record view" }, { status: 500 })
    }

    // Update shortlink total_views count (matches schema column name)
    await adminSupabase
      .from("shortlinks")
      .update({ total_views: (shortlink.total_views || 0) + 1 })
      .eq("id", shortlinkId)

    // Award satoshis to user
    await adminSupabase.rpc("add_game_reward", {
      p_user_id: user.id,
      p_amount: shortlink.reward_satoshis
    })

    // Get updated stats
    const { count: newTodayCount } = await adminSupabase
      .from("shortlink_views")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("viewed_at", today.toISOString())

    return NextResponse.json({
      success: true,
      reward: shortlink.reward_satoshis,
      viewsToday: newTodayCount || 1
    })

  } catch (error) {
    console.error("Shortlink complete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
