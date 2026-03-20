import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { shortenUrl, isShortlinkConfigured } from "@/lib/shortlinks/provider"

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["admin", "superadmin"].includes(profile.role)) return null
  return user
}

export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = createAdminClient()
  const { data, error } = await db.from("shortlinks").select("*").order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shortlinks: data ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const { title, destination_url, reward_satoshis, view_time_seconds } = body
  if (!title || !destination_url || !reward_satoshis || !view_time_seconds) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  const db = createAdminClient()

  // Auto-shorten the destination URL if a shortlink provider is configured
  let finalUrl = destination_url
  if (isShortlinkConfigured()) {
    const shortened = await shortenUrl(destination_url)
    if (shortened.success && shortened.shortenedUrl) {
      finalUrl = shortened.shortenedUrl
    } else {
      // Log but don't block — admin can still add the link without shortening
      console.warn("[AdminShortlinks] Auto-shorten failed:", shortened.error)
    }
  }

  const { data, error } = await db.from("shortlinks").insert({
    title, destination_url: finalUrl,
    reward_satoshis: Number(reward_satoshis),
    view_time_seconds: Number(view_time_seconds),
    is_active: true,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shortlink: data })
}

export async function PATCH(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  // Re-shorten if destination_url is being updated
  if (updates.destination_url && isShortlinkConfigured()) {
    const shortened = await shortenUrl(updates.destination_url)
    if (shortened.success && shortened.shortenedUrl) {
      updates.destination_url = shortened.shortenedUrl
    }
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from("shortlinks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shortlink: data })
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from("shortlinks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
