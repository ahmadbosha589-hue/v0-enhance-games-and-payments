import { NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

async function verifyAdmin() {
  const user = await getUser()
  if (!user) return null
  const supabase = createAdminClient()
  if (!supabase) return null
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["admin", "superadmin"].includes(profile.role)) return null
  return { user, supabase }
}

export async function GET() {
  try {
    const admin = await verifyAdmin()
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: settings, error } = await admin.supabase
      .from("ad_settings").select("*").order("position")
    if (error) return NextResponse.json({ settings: [] })
    return NextResponse.json({ settings: settings ?? [] })
  } catch {
    return NextResponse.json({ settings: [] })
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await verifyAdmin()
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await request.json()
    const { id, ...changes } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
    const { error } = await admin.supabase
      .from("ad_settings")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}