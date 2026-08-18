
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get("username")
    const currentUserId = searchParams.get("userId")

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 })
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ available: false, reason: "Invalid username format" }, { status: 200 })
    }

    const supabase = requireAdminClient()

    // Check if username exists (excluding current user)
    let query = supabase.from("profiles").select("id").ilike("username", username).limit(1)

    if (currentUserId) {
      query = query.neq("id", currentUserId)
    }

    const { data, error } = await query

    if (error) {
      logger.error("Username check error", { error })
      return NextResponse.json({ error: "Failed to check username" }, { status: 500 })
    }

    const isAvailable = !data || data.length === 0

    return NextResponse.json({ available: isAvailable })
  } catch (error) {
    logger.error("Username check exception", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
