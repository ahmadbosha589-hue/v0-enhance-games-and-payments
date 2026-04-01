import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const adminSupabase = createAdminClient()
    
    if (!adminSupabase) {
      return NextResponse.json({ withdrawals: [] })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50)

    // Get recent completed withdrawals with user info
    const { data: withdrawals, error } = await adminSupabase
      .from("withdrawals")
      .select(`
        id,
        user_id,
        amount_satoshis,
        payment_currency,
        payment_method,
        created_at,
        profiles!withdrawals_user_id_fkey (
          username,
          display_name
        )
      `)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Error fetching recent withdrawals:", error)
      return NextResponse.json({ withdrawals: [] })
    }

    // Get user tiers for these users
    const userIds = (withdrawals || []).map((w: any) => w.user_id).filter(Boolean)
    
    let userTiers: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: boosters } = await adminSupabase
        .from("user_boosters")
        .select("user_id, tier")
        .in("user_id", userIds)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
      
      if (boosters) {
        userTiers = boosters.reduce((acc: Record<string, string>, b: any) => {
          acc[b.user_id] = b.tier
          return acc
        }, {})
      }
    }

    // Transform data for ticker display
    const formattedWithdrawals = (withdrawals || []).map((w: any) => ({
      id: w.id,
      username: w.profiles?.display_name || w.profiles?.username || "Anonymous",
      amount: w.amount_satoshis,
      currency: w.payment_currency || "sats",
      method: w.payment_method || "faucetpay",
      created_at: w.created_at,
      user_tier: userTiers[w.user_id] || "none",
    }))

    return NextResponse.json({ withdrawals: formattedWithdrawals })
  } catch (error) {
    console.error("Recent withdrawals API error:", error)
    return NextResponse.json({ withdrawals: [] })
  }
}
