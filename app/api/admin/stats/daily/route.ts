import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    // Verify the requester is an admin
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminSupabase = createAdminClient()
    if (!adminSupabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 })

    // Verify admin role
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get("days") || "7")))

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Fetch claims with admin client (bypasses RLS)
    const { data: claims } = await adminSupabase
      .from("claims")
      .select("created_at, amount_satoshis, user_id")
      .gte("created_at", since.toISOString())
      .limit(5000)

    // Build daily buckets
    const buckets: Record<string, { claims: number; users: Set<string>; satoshis: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      buckets[d.toISOString().split("T")[0]] = { claims: 0, users: new Set(), satoshis: 0 }
    }

    ; (claims || []).forEach(claim => {
      const key = claim.created_at?.split("T")[0]
      if (key && buckets[key]) {
        buckets[key].claims++
        buckets[key].users.add(claim.user_id)
        buckets[key].satoshis += Number(claim.amount_satoshis || 0)
      }
    })

    const data = Object.entries(buckets).map(([dateStr, stats]) => ({
      date: new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
      claims: stats.claims,
      users: stats.users.size,
      satoshis: stats.satoshis,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    console.error("Admin stats error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}