import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Get the last 7 days
    const dates: string[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split("T")[0])
    }

    // Fetch daily claims data
    const dailyData = await Promise.all(
      dates.map(async (date) => {
        const startOfDay = `${date}T00:00:00.000Z`
        const endOfDay = `${date}T23:59:59.999Z`

        // Get claims count and total satoshi for the day
        const { data: claimsData, count: claimsCount } = await supabase
          .from("claims")
          .select("amount", { count: "exact" })
          .gte("created_at", startOfDay)
          .lte("created_at", endOfDay)

        // Calculate total satoshi
        const totalSatoshi = claimsData?.reduce((sum, claim) => sum + (claim.amount || 0), 0) || 0

        // Get unique users who made claims that day
        const { data: usersData } = await supabase
          .from("claims")
          .select("user_id")
          .gte("created_at", startOfDay)
          .lte("created_at", endOfDay)

        const uniqueUsers = new Set(usersData?.map((c) => c.user_id) || []).size

        // Format date for display
        const displayDate = new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })

        return {
          date: displayDate,
          users: uniqueUsers,
          claims: claimsCount || 0,
          satoshi: totalSatoshi,
        }
      }),
    )

    // Fetch fraud/risk distribution from profiles
    let fraudData = [
      { type: "Clean", value: 0 },
      { type: "Low Risk", value: 0 },
      { type: "Medium Risk", value: 0 },
      { type: "High Risk", value: 0 },
    ]

    try {
      const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true })

      if (totalUsers && totalUsers > 0) {
        // Get users by fraud score ranges
        const { count: cleanUsers } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .or("fraud_score.is.null,fraud_score.lt.25")

        const { count: lowRiskUsers } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("fraud_score", 25)
          .lt("fraud_score", 50)

        const { count: mediumRiskUsers } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("fraud_score", 50)
          .lt("fraud_score", 75)

        const { count: highRiskUsers } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("fraud_score", 75)

        fraudData = [
          { type: "Clean", value: Math.round(((cleanUsers || 0) / totalUsers) * 100) },
          { type: "Low Risk", value: Math.round(((lowRiskUsers || 0) / totalUsers) * 100) },
          { type: "Medium Risk", value: Math.round(((mediumRiskUsers || 0) / totalUsers) * 100) },
          { type: "High Risk", value: Math.round(((highRiskUsers || 0) / totalUsers) * 100) },
        ]
      }
    } catch {
      // fraud_score column might not exist, use default data
    }

    return NextResponse.json({
      dailyData,
      fraudData,
    })
  } catch (error) {
    console.error("Analytics data error:", error)
    return NextResponse.json({ error: "Failed to fetch analytics data" }, { status: 500 })
  }
}
