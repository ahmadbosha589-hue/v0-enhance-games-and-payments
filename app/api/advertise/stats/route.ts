import { z } from "zod"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { summarizeAdDaily } from "@/lib/ads/advertise-stats"

export const runtime = "nodejs"
export const maxDuration = 8

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  campaignId: z.string().uuid().optional(),
})

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const params = Object.fromEntries(new URL(request.url).searchParams.entries())
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) return NextResponse.json({ error: "Invalid stats query" }, { status: 400 })

    const since = new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)

    let query = supabase
      .from("ad_campaign_daily")
      .select("campaign_id, day, impressions, viewable, clicks, conversions, spend")
      .gte("day", since)
      .order("day", { ascending: true })

    if (parsed.data.campaignId) query = query.eq("campaign_id", parsed.data.campaignId)

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []).map((row) => ({
      day: row.day,
      impressions: Number(row.impressions || 0),
      viewable: Number(row.viewable || 0),
      clicks: Number(row.clicks || 0),
      conversions: Number(row.conversions || 0),
      spend: Number(row.spend || 0),
    }))

    return NextResponse.json({
      days: parsed.data.days,
      since,
      campaignId: parsed.data.campaignId || null,
      ...summarizeAdDaily(rows),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    console.error("[Advertise stats] query failed:", error)
    return NextResponse.json({ error: "Failed to load campaign statistics" }, { status: 500 })
  }
}
