export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use admin client to bypass RLS — shortlinks are public by design
    // (all authenticated users should see active shortlinks)
    const db = createAdminClient()

    if (!db) {
      console.error("[shortlinks] Admin client not available - check SUPABASE_SERVICE_ROLE_KEY")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { data, error } = await db
      .from("shortlinks")
      .select("id, title, destination_url, reward_satoshis, view_time_seconds, is_active")
      .eq("is_active", true)
      .order("reward_satoshis", { ascending: false })

    if (error) {
      console.error("[shortlinks] DB error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ shortlinks: data ?? [] })
  } catch (err) {
    console.error("[shortlinks] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
