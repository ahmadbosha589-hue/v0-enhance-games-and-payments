import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser, requireAdmin } from "@/lib/supabase/server"

export async function GET() {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      // Return empty data when database is not configured
      return NextResponse.json({
        coupons: [],
        stats: {
          totalCoupons: 0,
          activeCoupons: 0,
          totalRedemptions: 0,
          totalSatoshisGiven: 0,
        },
      })
    }

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all coupons
    const { data: coupons, error } = await adminSupabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Admin Coupons] Fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch coupons" }, { status: 500 })
    }

    // Calculate stats - using current_uses (not uses_remaining)
    const totalCoupons = coupons?.length || 0
    const activeCoupons = coupons?.filter(c => c.is_active && (c.current_uses || 0) < c.max_uses).length || 0
    const totalRedemptions = coupons?.reduce((acc, c) => acc + (c.current_uses || 0), 0) || 0
    const totalSatoshisGiven = coupons?.reduce(
      (acc, c) => acc + (c.current_uses || 0) * c.reward_satoshis,
      0
    ) || 0

    return NextResponse.json({
      coupons: coupons || [],
      stats: {
        totalCoupons,
        activeCoupons,
        totalRedemptions,
        totalSatoshisGiven,
      },
    })
  } catch (error) {
    console.error("[Admin Coupons] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Check if user is admin
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { code, description, reward_satoshis, max_uses, expires_days, is_active } = body

    if (!code || typeof code !== "string" || code.length < 4) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 })
    }

    if (!reward_satoshis || reward_satoshis < 1 || reward_satoshis > 10000) {
      return NextResponse.json({ error: "Invalid reward amount" }, { status: 400 })
    }

    // Check if code already exists
    const { data: existing } = await adminSupabase
      .from("coupons")
      .select("id")
      .eq("code", code.toUpperCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 })
    }

    // Create coupon
    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: newCoupon, error } = await adminSupabase
      .from("coupons")
      .insert({
        code: code.toUpperCase(),
        description: description || "",
        reward_satoshis,
        max_uses: max_uses || 100,
        current_uses: 0,
        expires_at: expiresAt,
        is_active: is_active !== false,
        is_demo: false,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("[Admin Coupons] Create error:", error)
      return NextResponse.json({ error: "Failed to create coupon" }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupon: newCoupon })
  } catch (error) {
    console.error("[Admin Coupons] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
