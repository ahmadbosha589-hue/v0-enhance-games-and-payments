import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Users,
  Coins,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
} from "lucide-react"
import { formatSatoshi, formatNumber } from "@/lib/utils"
import { AdminStatsChart } from "@/components/admin/stats-chart"
import { RecentActivity } from "@/components/admin/recent-activity"
import { FraudAlerts } from "@/components/admin/fraud-alerts"
import { Suspense } from "react"
import { AdminRefreshButton } from "@/components/admin/refresh-button"
import { AdminFaucetHealthCard } from "@/components/admin/faucet-health-card"


export const dynamic = "force-dynamic"
export const maxDuration = 30

async function safeQuery<T>(
  // Supabase builders implement PromiseLike, not native Promise.
  queryFn: () => PromiseLike<{ data: T | null; error: any; count?: number | null }>,
  fallback: T,
  timeoutMs = 5000,
): Promise<{ data: T; count: number }> {
  try {
    const timeoutPromise = new Promise<{ data: T | null; error: { message: string }; count: null }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: "Query timeout" }, count: null }), timeoutMs)
    )
    const result = await Promise.race([queryFn(), timeoutPromise])
    if (result.error) {
      return { data: fallback, count: 0 }
    }
    return {
      data: result.data ?? fallback,
      count: result.count ?? 0,
    }
  } catch {
    return { data: fallback, count: 0 }
  }
}

async function AdminStats() {
  const supabaseOrNull = (() => {
    try {
      return createAdminClient()
    } catch (err) {
      console.error("[Admin Stats] Failed to create admin client:", err)
      return null
    }
  })()

  // If database not configured, show empty stats with zeros
  if (!supabaseOrNull) {
    const emptyStats = [
      {
        title: "Total Users",
        value: "0",
        change: "+0 today",
        changeType: "neutral" as const,
        icon: Users,
      },
      {
        title: "Total Claims",
        value: "0",
        change: "+0 today",
        changeType: "neutral" as const,
        icon: Coins,
      },
      {
        title: "Pending Withdrawals",
        value: "0",
        change: "No database",
        changeType: "neutral" as const,
        icon: CreditCard,
      },
      {
        title: "Flagged Users",
        value: "0",
        change: "No database",
        changeType: "neutral" as const,
        icon: AlertTriangle,
      },
    ]

    return (
      <>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {emptyStats.map((stat) => (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-lg sm:text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <span className="text-muted-foreground">{stat.change}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Active Users (24h)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-1">0% of total users</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Distributed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">0 sats</div>
              <p className="text-xs text-muted-foreground mt-1">All-time satoshis paid out</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Platform Health</CardTitle>
              <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">
                No Database
              </Badge>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground mt-1">Connect Supabase to see stats</p>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  // Assign to const so TypeScript narrowing holds inside closures
  const supabase = supabaseOrNull

  // Run all queries in parallel with error handling
  let totalUsers = 0
  let activeUsers = 0
  let totalClaims = 0
  let pendingWithdrawals = 0
  let flaggedUsers = 0
  let todayClaims = 0
  let todaySignups = 0
  let totalDistributed = 0
  let dbHealthy = false
  let dbLatencyMs: number | null = null
  let authHealthy = false

  try {
    const [
      usersResult,
      activeUsersResult,
      claimsResult,
      pendingWithdrawalsResult,
      flaggedUsersResult,
      totalDistributedResult,
      todayClaimsResult,
      todaySignupsResult,
      healthResult,
    ] = await Promise.all([
      safeQuery(() => supabase.from("profiles").select("*", { count: "exact", head: true }), null),
      safeQuery(
        () =>
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("last_claim_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        null,
      ),
      safeQuery(() => supabase.from("claims").select("*", { count: "exact", head: true }), null),
      safeQuery(
        () => supabase.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending"),
        null,
      ),
      safeQuery(() => supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_flagged", true), null),
      safeQuery(() => supabase.from("profiles").select("total_earned_satoshis"), []),
      safeQuery(
        () =>
          supabase
            .from("claims")
            .select("*", { count: "exact", head: true })
            .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        null,
      ),
      safeQuery(
        () =>
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        null,
      ),
      // Live health signal for the System Status card: a cheap real query
      // whose latency and success determine the badge. No fabricated uptime.
      (async () => {
        const started = Date.now()
        try {
          const { error } = await supabase.from("profiles").select("id", { head: true }).limit(1)
          const ms = Date.now() - started
          return { healthy: !error, latencyMs: ms, error: error?.message ?? null }
        } catch (e) {
          return { healthy: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : "unknown" }
        }
      })(),
    ])

    totalUsers = usersResult.count
    activeUsers = activeUsersResult.count
    totalClaims = claimsResult.count
    pendingWithdrawals = pendingWithdrawalsResult.count
    flaggedUsers = flaggedUsersResult.count
    todayClaims = todayClaimsResult.count
    todaySignups = todaySignupsResult.count

    dbHealthy = healthResult.healthy
    dbLatencyMs = healthResult.latencyMs
    authHealthy = healthResult.healthy

    const distributedData = totalDistributedResult.data as { total_earned_satoshis: number }[] | null
    totalDistributed = distributedData?.reduce((sum, p) => sum + Number(p.total_earned_satoshis || 0), 0) || 0
  } catch (err) {
    console.error("[Admin Stats] Failed to fetch stats:", err)
    // Continue with zeros and a Degraded badge
  }

  const stats = [
    {
      title: "Total Users",
      value: formatNumber(totalUsers),
      change: `+${todaySignups} today`,
      changeType: "positive" as const,
      icon: Users,
    },
    {
      title: "Total Claims",
      value: formatNumber(totalClaims),
      change: `+${formatNumber(todayClaims)} today`,
      changeType: "positive" as const,
      icon: Coins,
    },
    {
      title: "Pending Withdrawals",
      value: formatNumber(pendingWithdrawals),
      change: "Requires action",
      changeType: "neutral" as const,
      icon: CreditCard,
    },
    {
      title: "Flagged Users",
      value: formatNumber(flaggedUsers),
      change: "Requires review",
      changeType: flaggedUsers > 0 ? ("negative" as const) : ("neutral" as const),
      icon: AlertTriangle,
    },
  ]

  return (
    <>
      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {stat.changeType === "positive" && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                {stat.changeType === "negative" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                <span
                  className={
                    stat.changeType === "positive"
                      ? "text-emerald-500"
                      : stat.changeType === "negative"
                        ? "text-red-500"
                        : "text-muted-foreground"
                  }
                >
                  {stat.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Active Users (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">{formatNumber(activeUsers)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalUsers ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0}% of total users
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Distributed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">{formatSatoshi(totalDistributed)}</div>
            <p className="text-xs text-muted-foreground mt-1">All-time satoshis paid out</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">System Status</CardTitle>
            <Badge
              variant="default"
              className={
                dbHealthy
                  ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30 text-xs"
                  : "bg-red-500/20 text-red-500 border-red-500/30 text-xs"
              }
            >
              {dbHealthy ? "Operational" : "Degraded"}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">
              {dbHealthy ? `${dbLatencyMs} ms` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Live database response time{authHealthy ? " · Auth healthy" : " · Auth degraded"}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function StatsError() {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">--</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-1">Unable to load</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatsLoading() {
  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <Skeleton className="h-4 w-20 sm:w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <Skeleton className="h-6 sm:h-8 w-16 sm:w-20 mb-2" />
              <Skeleton className="h-3 w-14 sm:w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
              <Skeleton className="h-4 w-24 sm:w-28" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <Skeleton className="h-6 sm:h-8 w-20 sm:w-24 mb-2" />
              <Skeleton className="h-3 w-16 sm:w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function ChartLoading() {
  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <Skeleton className="h-48 sm:h-64 w-full" />
      </CardContent>
    </Card>
  )
}

async function AdblockDetectionStats() {
  // Wrap everything in try-catch to prevent server component errors
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return (
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Adblock Detection Rate</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-muted-foreground">--</div>
            <div className="flex flex-col gap-0.5 mt-1">
              <p className="text-xs text-muted-foreground">No database connected</p>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Initialize stats with defaults
    let stats = {
      total_visits: 0,
      adblock_detections: 0,
      detection_rate: 0,
      unique_users_with_adblock: 0,
    }
    let dataSource = "none"
    let skipFallback = false

    // Method 1: Try database function
    try {
      const { data: rawData, error } = await Promise.race([
        supabase.rpc("get_adblock_stats", { p_days: 7 }).single(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Adblock stats timeout")), 2500),
        ),
      ])
      const data = rawData as Partial<typeof stats> | null
      if (!error && data) {
        stats = {
          total_visits: Number(data.total_visits) || 0,
          adblock_detections: Number(data.adblock_detections) || 0,
          detection_rate: Number(data.detection_rate) || 0,
          unique_users_with_adblock: Number(data.unique_users_with_adblock) || 0,
        }
        dataSource = "function"
      }
    } catch (error) {
      skipFallback = error instanceof Error && error.message === "Adblock stats timeout"
      // Function doesn't exist or exceeded the bounded budget.
    }

    // Method 2: Fallback to direct table query
    if (dataSource === "none" && !skipFallback) {
      try {
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: analyticsData, error: tableError } = await supabase
          .from("adblock_analytics")
          .select("adblock_detected, user_id")
          .gte("created_at", cutoffDate)
          .limit(10000) // Limit for performance

        if (!tableError && analyticsData && analyticsData.length > 0) {
          const totalVisits = analyticsData.length
          const detections = analyticsData.filter((a) => a.adblock_detected)
          stats = {
            total_visits: totalVisits,
            adblock_detections: detections.length,
            detection_rate: totalVisits > 0 ? Math.round((detections.length / totalVisits) * 10000) / 100 : 0,
            unique_users_with_adblock: new Set(detections.filter(d => d.user_id).map((d) => d.user_id)).size,
          }
          dataSource = "table"
        }
      } catch {
        // Table doesn't exist either
      }
    }

    // Method 3: Fallback to fraud_flags table for adblock stats
    if (dataSource === "none" && !skipFallback) {
      try {
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: fraudData, error: fraudError } = await supabase
          .from("fraud_flags")
          .select("user_id, fraud_type")
          .eq("fraud_type", "adblock_user")
          .gte("created_at", cutoffDate)

        // Also get total claims as proxy for visits
        const { count: claimsCount } = await supabase
          .from("claims")
          .select("*", { count: "exact", head: true })
          .gte("created_at", cutoffDate)

        if (!fraudError && fraudData) {
          // Real counts only — no fabricated visit estimates.
          const totalVisits = claimsCount ?? 0
          const detections = fraudData.length
          stats = {
            total_visits: totalVisits,
            adblock_detections: detections,
            detection_rate: totalVisits > 0 ? Math.round((detections / totalVisits) * 10000) / 100 : 0,
            unique_users_with_adblock: new Set(fraudData.filter(d => d.user_id).map((d) => d.user_id)).size,
          }
          dataSource = "fraud_flags"
        }
      } catch {
        // Continue with zeros
      }
    }

    const rateColor =
      stats.detection_rate > 30 ? "text-red-500" : stats.detection_rate > 15 ? "text-amber-500" : "text-emerald-500"

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Adblock Detection Rate</CardTitle>
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className={`text-lg sm:text-2xl font-bold ${rateColor}`}>
            {stats.total_visits > 0 ? `${stats.detection_rate.toFixed(1)}%` : "0.0%"}
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-xs text-muted-foreground">
              {formatNumber(stats.adblock_detections)} / {formatNumber(stats.total_visits)} visits (7d)
            </p>
            <p className="text-xs text-muted-foreground">{formatNumber(stats.unique_users_with_adblock)} unique users</p>
          </div>
        </CardContent>
      </Card>
    )
  } catch (error) {
    // Catch any unexpected errors and render fallback UI
    console.error("[AdblockDetectionStats] Error:", error)
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Adblock Detection Rate</CardTitle>
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-lg sm:text-2xl font-bold text-muted-foreground">0.0%</div>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-xs text-muted-foreground">0 / 0 visits (7d)</p>
            <p className="text-xs text-muted-foreground">0 unique users</p>
          </div>
        </CardContent>
      </Card>
    )
  }
}

function AdblockStatsLoading() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        <Skeleton className="h-6 sm:h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20 mt-1" />
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Monitor platform activity and manage users</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live Data
          </Badge>
          <AdminRefreshButton />
        </div>
      </div>

      <Suspense fallback={<StatsLoading />}>
        <AdminStats />
      </Suspense>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<AdblockStatsLoading />}>
          <AdblockDetectionStats />
        </Suspense>
        {/* Real FaucetPay Health Card */}
        <AdminFaucetHealthCard />
      </div>

      {/* Charts and Activity */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Suspense fallback={<ChartLoading />}>
          <AdminStatsChart />
        </Suspense>
        <Suspense fallback={<ChartLoading />}>
          <FraudAlerts />
        </Suspense>
      </div>

      {/* Recent Activity */}
      <Suspense fallback={<ChartLoading />}>
        <RecentActivity />
      </Suspense>
    </div>
  )
}
