import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"
import { generateSecureCouponCode } from "@/lib/utils/secure-coupon-generator"

export async function POST(req: NextRequest) {
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

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { count, description, reward_satoshis, max_uses, expires_days } = body

    if (!count || count < 1 || count > 100) {
      return NextResponse.json({ error: "Invalid count (1-100)" }, { status: 400 })
    }

    if (!reward_satoshis || reward_satoshis < 1 || reward_satoshis > 10000) {
      return NextResponse.json({ error: "Invalid reward amount" }, { status: 400 })
    }

    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString()
      : null

    // Generate unique codes
    const codes: string[] = []
    const maxAttempts = count * 3
    let attempts = 0

    while (codes.length < count && attempts < maxAttempts) {
      const code = generateSecureCouponCode()
      
      // Check if code already exists
      const { data: existing } = await adminSupabase
        .from("coupons")
        .select("id")
        .eq("code", code)
        .single()

      if (!existing && !codes.includes(code)) {
        codes.push(code)
      }
      attempts++
    }

    if (codes.length < count) {
      return NextResponse.json({ 
        error: `Could only generate ${codes.length} unique codes` 
      }, { status: 500 })
    }

    // Insert all coupons
    const couponsToInsert = codes.map((code) => ({
      code,
      description: description || "Generated coupon",
      reward_satoshis,
      max_uses: max_uses || 10,
      uses_remaining: max_uses || 10,
      expires_at: expiresAt,
      is_active: true,
      is_demo: false,
    }))

    const { error } = await adminSupabase
      .from("coupons")
      .insert(couponsToInsert)

    if (error) {
      console.error("[Admin Coupons Bulk] Insert error:", error)
      return NextResponse.json({ error: "Failed to create coupons" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      count: codes.length,
      codes,
    })
  } catch (error) {
    console.error("[Admin Coupons Bulk] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
