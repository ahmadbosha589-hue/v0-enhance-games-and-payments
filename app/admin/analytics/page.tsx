import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnalyticsCharts } from "@/components/admin/analytics-charts"
import { formatNumber } from "@/lib/utils"
import { TrendingUp, Users, Coins, CreditCard, Percent, ShieldAlert, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage() {
  const supabase = await createClient()

  if (!supabase) {
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

  // Get various analytics
  const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true })

  const { count: totalClaims } = await supabase.from("claims").select("*", { count: "exact", head: true })

  // Last 7 days stats
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const { count: newUsersWeek } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString())

  const { count: claimsWeek } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString())

  const { count: withdrawalsWeek } = await supabase
    .from("withdrawals")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString())

  // Calculate averages
  const avgClaimsPerUser = totalUsers ? (totalClaims || 0) / totalUsers : 0

  let adblockStats = {
    total_visits: 0,
    adblock_detections: 0,
    detection_rate: 0,
  }

  try {
    const { data, error } = await supabase.rpc("get_adblock_stats", { p_days: 7 }).single()
    if (!error && data) {
      adblockStats = data
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
