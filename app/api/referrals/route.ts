import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)
    const offset = Number(searchParams.get("offset")) || 0

    // Get profile for stats
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_code, referral_count, referral_earnings")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get referrals
    const {
      data: referrals,
      error,
      count,
    } = await supabase
      .from("profiles")
      .select("id, username, created_at, total_claims, total_earned", { count: "exact" })
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch referrals" }, { status: 500 })
    }

    // Calculate earnings from referrals
    const { data: commissions } = await supabase
      .from("transactions")
      .select("amount, created_at, metadata")
      .eq("user_id", user.id)
      .eq("type", "referral_commission")
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({
      stats: {
        referralCode: profile.referral_code,
        totalReferrals: profile.referral_count,
        totalEarnings: profile.referral_earnings,
        referralLink: `${process.env.NEXT_PUBLIC_APP_URL || ""}/ref/${profile.referral_code}`,
      },
      referrals: referrals?.map((r) => ({
        id: r.id,
        username: r.username || `User ${r.id.slice(0, 8)}`,
        joinedAt: r.created_at,
        totalClaims: r.total_claims,
        totalEarned: r.total_earned,
      })),
      recentCommissions: commissions,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    })
  } catch (error) {
    console.error("Get referrals error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
