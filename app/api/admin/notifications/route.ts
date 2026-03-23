import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createAdminClient()
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [
      { data: notifications, count: total },
      { count: unread },
      { count: today },
    ] = await Promise.all([
      supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("read", false),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ])

    return NextResponse.json({
      notifications: notifications || [],
      stats: { total: total || 0, unread: unread || 0, today: today || 0 },
    })
  } catch (err) {
    console.error("Admin notifications error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createAdminClient()
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { targetAudience, type, title, message, userId } = body

    if (!type || !title || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (targetAudience === "all") {
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "active")

      if (!users || users.length === 0) {
        return NextResponse.json({ error: "No active users found" }, { status: 404 })
      }

      const { error } = await supabase.from("notifications").insert(
        users.map((u) => ({ user_id: u.id, type, title, message, read: false })),
      )
      if (error) throw error

      return NextResponse.json({ sent: users.length })
    } else if (targetAudience === "specific" && userId) {
      const { error } = await supabase.from("notifications").insert({
        user_id: userId, type, title, message, read: false,
      })
      if (error) throw error
      return NextResponse.json({ sent: 1 })
    }

    return NextResponse.json({ error: "Invalid target audience" }, { status: 400 })
  } catch (err) {
    console.error("Admin send notification error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}