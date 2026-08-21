import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { createWatchToken } from "@/lib/rewards/watch-session"

type RouteContext = { params: Promise<{ id: string }> }

async function getAuthenticatedUser() {
  const user = await getUser()
  if (!user) {
    throw new Error("UNAUTHORIZED")
  }
  return user
}

async function loadAvailableAd(id: string) {
  const adminSupabase = createAdminClient()
  if (!adminSupabase) {
    throw new Error("SERVICE_UNAVAILABLE")
  }

  const now = new Date().toISOString()
  const { data: ad, error } = await adminSupabase
    .from("ptc_ads")
    .select("id, title, description, url, duration_seconds, reward_satoshis, start_date, end_date")
    .eq("id", id)
    .eq("is_active", true)
    .eq("is_approved", true)
    .gt("remaining_budget_satoshis", 0)
    .lte("start_date", now)
    .or(`end_date.is.null,end_date.gt.${now}`)
    .single()

  if (error || !ad) return null
  return { adminSupabase, ad }
}

async function hasCompletedToday(adminSupabase: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, adId: string) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const { data, error } = await adminSupabase
    .from("ptc_views")
    .select("id")
    .eq("user_id", userId)
    .eq("ad_id", adId)
    .eq("completed", true)
    .gte("created_at", today.toISOString())
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const user = await getAuthenticatedUser()
    const available = await loadAvailableAd(id)

    if (!available) {
      return NextResponse.json({ error: "Ad not found or no longer available" }, { status: 404 })
    }

    if (await hasCompletedToday(available.adminSupabase, user.id, id)) {
      return NextResponse.json({ error: "You already watched this ad today" }, { status: 400 })
    }

    // GET only describes the ad. The reward clock starts in POST after the
    // user explicitly presses Start.
    return NextResponse.json({ ad: available.ad })
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof Error && error.message === "SERVICE_UNAVAILABLE") {
      return NextResponse.json({ error: "PTC ads are temporarily unavailable" }, { status: 503 })
    }
    console.error("Error fetching PTC ad:", error)
    return NextResponse.json({ error: "PTC ads are temporarily unavailable" }, { status: 503 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const user = await getAuthenticatedUser()
    const available = await loadAvailableAd(id)

    if (!available) {
      return NextResponse.json({ error: "Ad not found or no longer available" }, { status: 404 })
    }

    if (await hasCompletedToday(available.adminSupabase, user.id, id)) {
      return NextResponse.json({ error: "You already watched this ad today" }, { status: 400 })
    }

    const startedAt = Date.now()
    const watchToken = createWatchToken({
      kind: "ptc",
      userId: user.id,
      resourceId: id,
      startedAt,
      expiresAt: startedAt + Math.max(
        30 * 60 * 1000,
        Number(available.ad.duration_seconds) * 1000 + 5 * 60 * 1000,
      ),
    })

    return NextResponse.json({
      ad: available.ad,
      watchToken,
      watchStartedAt: startedAt,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof Error && error.message === "SERVICE_UNAVAILABLE") {
      return NextResponse.json({ error: "PTC rewards are temporarily unavailable" }, { status: 503 })
    }
    console.error("Error starting PTC watch session:", error)
    return NextResponse.json({ error: "PTC rewards are temporarily unavailable" }, { status: 503 })
  }
}
