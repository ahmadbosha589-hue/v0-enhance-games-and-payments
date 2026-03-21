"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { createClient as createBrowserClient } from "@/lib/supabase/client"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DailyStats {
  date: string
  claims: number
  users: number
  satoshis: number
}

function generateEmptyData(): DailyStats[] {
  const result: DailyStats[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    result.push({
      date: date.toLocaleDateString("en-US", { weekday: "short" }),
      claims: 0,
      users: 0,
      satoshis: 0,
    })
  }
  return result
}

export function AdminStatsChart() {
  const [data, setData] = useState<DailyStats[]>(generateEmptyData())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      // Use the admin API route so we can see all claims (user client is RLS-restricted)
      // We keep createBrowserClient available but query via our own admin endpoint instead

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const statsRes = await fetch(
        `/api/admin/stats/daily?days=7`,
        { signal: controller.signal, credentials: "include" }
      )
      clearTimeout(timeoutId)

      if (!statsRes.ok) {
        setData(generateEmptyData())
        setIsLoading(false)
        return
      }

      const statsJson = await statsRes.json()
      if (statsJson.data) {
        setData(statsJson.data)
        setIsLoading(false)
        return
      }

      // Fallback: show empty data - the admin API is the primary source
      // Direct browser client queries are blocked by RLS for non-self data
      setData(generateEmptyData())
      setIsLoading(false)
      return

      // Group by day
      const dailyData: Record<string, { claims: number; users: Set<string>; satoshis: number }> = {}

      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const key = date.toISOString().split("T")[0]
        dailyData[key] = { claims: 0, users: new Set(), satoshis: 0 }
      }

      claims?.forEach((claim) => {
        const key = claim.created_at.split("T")[0]
        if (dailyData[key]) {
          dailyData[key].claims++
          dailyData[key].users.add(claim.user_id)
          dailyData[key].satoshis += Number(claim.amount_satoshis)
        }
      })

      const formattedData = Object.entries(dailyData).map(([dateStr, stats]) => ({
        date: new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
        claims: stats.claims,
        users: stats.users.size,
        satoshis: stats.satoshis,
      }))

      setData(formattedData)
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("Request timed out")
      }
      setData(generateEmptyData())
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Platform Activity</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Loading activity data...</CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <Skeleton className="h-48 sm:h-[250px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Platform Activity</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Claims and active users over time</CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="flex flex-col items-center justify-center h-48 sm:h-[250px] text-muted-foreground gap-3">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2 bg-transparent">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-sm sm:text-base">Platform Activity</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Claims and active users over time</CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <Tabs defaultValue="claims">
          <TabsList className="mb-4 h-8 sm:h-9">
            <TabsTrigger value="claims" className="text-xs sm:text-sm px-2 sm:px-3">
              Claims
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm px-2 sm:px-3">
              Users
            </TabsTrigger>
          </TabsList>
          <TabsContent value="claims">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="claimsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="claims"
                  stroke="hsl(var(--primary))"
                  fill="url(#claimsGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
          <TabsContent value="users">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="hsl(var(--chart-2))"
                  fill="url(#usersGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
