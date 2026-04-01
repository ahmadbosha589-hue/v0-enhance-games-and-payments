import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

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

    const adminSupabase = createAdminClient()

    // Get the specific ad
    const { data: ad, error } = await adminSupabase
      .from("ptc_ads")
      .select("id, title, description, url, duration_seconds, reward_satoshis")
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_approved", true)
      .gt("remaining_budget_satoshis", 0)
      .single()

    if (error || !ad) {
      return NextResponse.json({ error: "Ad not found or no longer available" }, { status: 404 })
    }

    // Check if user already watched this ad today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const { data: existingView } = await adminSupabase
      .from("ptc_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("ad_id", id)
      .gte("created_at", today.toISOString())
      .single()

    if (existingView) {
      return NextResponse.json({ error: "You already watched this ad today" }, { status: 400 })
    }

    return NextResponse.json({ ad })
  } catch (error) {
    console.error("Error fetching PTC ad:", error)
    return NextResponse.json({ error: "Failed to fetch ad" }, { status: 500 })
  }
}
