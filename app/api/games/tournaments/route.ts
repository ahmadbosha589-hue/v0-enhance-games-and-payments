import { NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminSupabase = requireAdminClient()

    // Try to fetch real tournaments from DB
    const { data: tournaments, error } = await adminSupabase
      .from("game_tournaments")
      .select("*")
      .order("start_time", { ascending: true })

    if (error && error.code !== "42P01") {
      console.error("[Tournaments] DB error:", error)
    }

    // If table exists and has data, return it
    if (tournaments && tournaments.length > 0) {
      return NextResponse.json({ tournaments })
    }

    // Table doesn't exist yet — return empty list (no fake data)
    return NextResponse.json({ tournaments: [] })
  } catch (error) {
    console.error("[Tournaments] Error:", error)
    return NextResponse.json({ tournaments: [] })
  }
}
