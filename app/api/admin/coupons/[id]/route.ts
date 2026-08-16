import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    const updates: Record<string, unknown> = {}

    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active
    }

    if (typeof body.description === "string") {
      updates.description = body.description
    }

    if (typeof body.reward_satoshis === "number") {
      updates.reward_satoshis = body.reward_satoshis
    }

    if (typeof body.max_uses === "number") {
      updates.max_uses = body.max_uses
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 })
    }

    const { data: updatedCoupon, error } = await adminSupabase
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[Admin Coupon Update] Error:", error)
      return NextResponse.json({ error: "Failed to update coupon" }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupon: updatedCoupon })
  } catch (error) {
    console.error("[Admin Coupon Update] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { error } = await adminSupabase
      .from("coupons")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[Admin Coupon Delete] Error:", error)
      return NextResponse.json({ error: "Failed to delete coupon" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Admin Coupon Delete] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
