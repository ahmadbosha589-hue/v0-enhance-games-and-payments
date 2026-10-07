import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnalyticsCharts } from "@/components/admin/analytics-charts"
import { formatNumber } from "@/lib/utils"
import { TrendingUp, Users, Coins, CreditCard, Percent, ShieldAlert, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage() {
  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Platform performance and insights</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database Not Connected</AlertTitle>
          <AlertDescription>
            Please configure your Supabase environment variables to view analytics data.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Default values for all stats
  let totalUsers = 0
  let totalClaims = 0
  let newUsersWeek = 0
  let claimsWeek = 0
  let withdrawalsWeek = 0
  let adblockStats = {
    total_visits: 0,
    adblock_detections: 0,
    detection_rate: 0,
  }

  try {
    const supabase = await createClient()

    if (supabase) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      // Fetch all stats in parallel with individual error handling
      const [
        totalUsersResult,
        totalClaimsResult,
        newUsersResult,
        claimsWeekResult,
        withdrawalsResult,
      ] = await Promise.all([
        Promise.resolve(supabase.from("profiles").select("*", { count: "exact", head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabase.from("claims").select("*", { count: "exact", head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString())).catch(() => ({ count: 0 })),
        Promise.resolve(supabase.from("claims").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString())).catch(() => ({ count: 0 })),
        Promise.resolve(supabase.from("withdrawals").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString())).catch(() => ({ count: 0 })),
      ])

      totalUsers = totalUsersResult.count || 0
      totalClaims = totalClaimsResult.count || 0
      newUsersWeek = newUsersResult.count || 0
      claimsWeek = claimsWeekResult.count || 0
      withdrawalsWeek = withdrawalsResult.count || 0

      // Get adblock stats
      try {
        const { data, error } = await supabase.rpc("get_adblock_stats", { p_days: 7 }).single()
        if (
          !error &&
          data &&
          typeof data === "object" &&
          "total_visits" in data &&
          "adblock_detections" in data &&
          "detection_rate" in data
        ) {
          adblockStats = {
            total_visits: Number(data.total_visits) || 0,
            adblock_detections: Number(data.adblock_detections) || 0,
            detection_rate: Number(data.detection_rate) || 0,
          }
        } else {
          // Fallback query
          const { data: analyticsData } = await supabase
            .from("adblock_analytics")
            .select("adblock_detected")
            .gte("created_at", weekAgo.toISOString())

          if (analyticsData) {
            const totalVisits = analyticsData.length
            const detections = analyticsData.filter((a) => a.adblock_detected).length
            adblockStats = {
              total_visits: totalVisits,
              adblock_detections: detections,
              detection_rate: totalVisits > 0 ? Math.round((detections / totalVisits) * 10000) / 100 : 0,
            }
          }
        }
      } catch {
        // Table might not exist yet
      }
    }
  } catch (error) {
    console.error("[AnalyticsPage] Error fetching data:", error)
    // Continue with default values
  }

  // Calculate averages
  const avgClaimsPerUser = totalUsers ? totalClaims / totalUsers : 0

  const rateColor =
    adblockStats.detection_rate > 30
      ? "text-red-500"
      : adblockStats.detection_rate > 15
        ? "text-amber-500"
        : "text-emerald-500"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Platform performance and insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Users (7d)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(newUsersWeek || 0)}</div>
            <div className="flex items-center text-xs text-emerald-500 mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              Growing
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Claims (7d)</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(claimsWeek || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {((claimsWeek || 0) / 7).toFixed(0)}/day avg
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Withdrawals (7d)</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(withdrawalsWeek || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">Processed requests</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Claims/User</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgClaimsPerUser.toFixed(1)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">Engagement metric</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Adblock Rate (7d)</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${rateColor}`}>{adblockStats.detection_rate.toFixed(1)}%</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {formatNumber(adblockStats.adblock_detections)} / {formatNumber(adblockStats.total_visits)} visits
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <AnalyticsCharts />
    </div>
  )
}
