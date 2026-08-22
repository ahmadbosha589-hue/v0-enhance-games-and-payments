import { NextResponse } from "next/server"
import { createAdminClient, getUser, requireAdmin } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
        .eq("is_read", false),
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
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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

    // Page through profiles so broadcasts are NOT silently truncated at the
    // PostgREST default 1000-row cap (the old code reported the truncated
    // length as `sent`).
    const PAGE_SIZE = 1000

    async function collectRecipientIds(): Promise<string[]> {
      const ids: string[] = []
      let from = 0
      for (;;) {
        let q = supabase!.from("profiles").select("id").eq("status", "active").range(from, from + PAGE_SIZE - 1)
        if (targetAudience === "active") {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          q = q.gte("last_claim_at", dayAgo)
        }
        const { data, error } = await q
        if (error) throw error
        const page = data ?? []
        ids.push(...page.map((u) => u.id))
        if (page.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return ids
    }

    if (targetAudience === "all" || targetAudience === "active") {
      const userIds = await collectRecipientIds()

      if (userIds.length === 0) {
        return NextResponse.json(
          { error: targetAudience === "active" ? "No active users in the last 24h" : "No active users found" },
          { status: 404 },
        )
      }

      // Insert in chunks to stay within request-size limits.
      const CHUNK = 500
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const rows = userIds.slice(i, i + CHUNK).map((uid) => ({
          user_id: uid, type, title, message, is_read: false,
        }))
        const { error } = await supabase!.from("notifications").insert(rows)
        if (error) throw error
      }

      return NextResponse.json({ sent: userIds.length })
    } else if (targetAudience === "specific" && userId) {
      // Column is is_read (the old code wrote a nonexistent `read` column and
      // targeted sends always failed with a 500).
      const { error } = await supabase!.from("notifications").insert({
        user_id: userId, type, title, message, is_read: false,
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