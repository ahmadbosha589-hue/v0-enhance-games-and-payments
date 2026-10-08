export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { createClient, getVerifiedUser } from "@/lib/supabase/server"
import { shortenUrl, isShortlinkConfigured } from "@/lib/shortlinks/provider"

import { requireAdminClient } from "@/lib/supabase/admin-client"
async function getAdmin() {
  const supabase = await createClient()
  // SECURITY: LIVE-verified identity — shortlink CRUD cannot run on a stale
  // cookie-derived session.
  const user = await getVerifiedUser()
  if (!user) return null
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (!profile || !["admin", "superadmin"].includes(profile.role)) return null
  return user
}

export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = requireAdminClient()
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
  // Numeric bounds — a negative reward would PAY users to visit links.
  if (!Number.isInteger(Number(reward_satoshis)) || Number(reward_satoshis) < 1 || Number(reward_satoshis) > 100000) {
    return NextResponse.json({ error: "reward_satoshis must be an integer between 1 and 100000" }, { status: 400 })
  }
  if (!Number.isInteger(Number(view_time_seconds)) || Number(view_time_seconds) < 1 || Number(view_time_seconds) > 600) {
    return NextResponse.json({ error: "view_time_seconds must be an integer between 1 and 600" }, { status: 400 })
  }
  const db = requireAdminClient()

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
  const { id, ...rawUpdates } = body
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  // Whitelist editable columns — the old spread let stale/crafted payloads
  // overwrite created_at, position, or any other column.
  const updates: Record<string, unknown> = {}
  for (const key of ["title", "destination_url", "is_active", "reward_satoshis", "view_time_seconds"] as const) {
    if (key in rawUpdates) updates[key] = rawUpdates[key]
  }
  if ("reward_satoshis" in updates) {
    const r = Number(updates.reward_satoshis)
    if (!Number.isInteger(r) || r < 1 || r > 100000) {
      return NextResponse.json({ error: "reward_satoshis must be an integer between 1 and 100000" }, { status: 400 })
    }
    updates.reward_satoshis = r
  }
  if ("view_time_seconds" in updates) {
    const v = Number(updates.view_time_seconds)
    if (!Number.isInteger(v) || v < 1 || v > 600) {
      return NextResponse.json({ error: "view_time_seconds must be an integer between 1 and 600" }, { status: 400 })
    }
    updates.view_time_seconds = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 })
  }

  // Re-shorten if destination_url is being updated
  if (typeof updates.destination_url === "string" && isShortlinkConfigured()) {
    const shortened = await shortenUrl(updates.destination_url)
    if (shortened.success && shortened.shortenedUrl) {
      updates.destination_url = shortened.shortenedUrl
    }
  }

  const db = requireAdminClient()
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
  const db = requireAdminClient()
  const { error } = await db.from("shortlinks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
