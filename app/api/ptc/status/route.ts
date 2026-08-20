import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get today's start in UTC
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // Count completed PTC ads for today
    const { count, error } = await supabase
      .from("ptc_views")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("completed", true)
      .gte("created_at", todayISO)

    if (error) {
      console.error("Error fetching PTC status:", error)
      return NextResponse.json(
        { error: "Failed to fetch PTC status" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      completedToday: count || 0,
      requiredForFaucet: 3,
      isUnlocked: (count || 0) >= 3,
      resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
  } catch (error) {
    console.error("PTC status error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
