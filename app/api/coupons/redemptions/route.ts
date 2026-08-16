import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      console.error("[coupons/redemptions] Admin client not available")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { data, error } = await adminSupabase
      .from("coupon_redemptions")
      .select(`
        id,
        coupon_id,
        redeemed_at,
        reward_satoshis,
        coupons (
          code,
          description
        )
      `)
      .eq("user_id", user.id)
      .order("redeemed_at", { ascending: false })
      .limit(10)

    if (error) {
      console.error("[coupons/redemptions] DB error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ redemptions: data ?? [] })
  } catch (err) {
    console.error("[coupons/redemptions] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
