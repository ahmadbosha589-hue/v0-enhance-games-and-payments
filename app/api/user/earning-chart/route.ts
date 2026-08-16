import { NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createAdminClient()
    if (!supabase) return NextResponse.json({ data: [] })

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: transactions } = await supabase
      .from("transactions")
      .select("amount_satoshis, created_at")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .in("type", [
        "claim", "referral_bonus", "bonus",
        "daily_bonus", "streak_bonus", "signup_bonus",
        "achievement", "game", "game_reward", "manual_faucet",
        "offerwall", "ptc", "shortlink", "coupon",
      ])
      .gt("amount_satoshis", 0)
      .order("created_at", { ascending: true })
      .limit(500)

    // Build daily buckets for last 7 days
    const dailyEarnings: Record<string, { earnings: number; fullDate: string }> = {}

    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toLocaleDateString("en-US", { weekday: "short" })
      const fullDate = date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
      dailyEarnings[key] = { earnings: 0, fullDate }
    }

    ; (transactions || []).forEach((tx) => {
      const date = new Date(tx.created_at)
      const key = date.toLocaleDateString("en-US", { weekday: "short" })
      if (key in dailyEarnings) {
        dailyEarnings[key].earnings += Number(tx.amount_satoshis) || 0
      }
    })

    const chartData = Object.entries(dailyEarnings).map(([date, { earnings, fullDate }]) => ({
      date,
      fullDate,
      earnings,
    }))

    return NextResponse.json({ data: chartData })
  } catch (err) {
    console.error("Earnings chart error:", err)
    return NextResponse.json({ data: [] })
  }
}