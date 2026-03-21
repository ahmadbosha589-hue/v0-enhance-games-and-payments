"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
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
      const statsRes = await fetch(
        `/api/admin/stats/daily?days=7`,
        { signal: controller.signal, credentials: "include" },
      )
      clearTimeout(timeoutId)

      if (!statsRes.ok) {
        // Non-200 from admin API (e.g. not admin, or table missing) — show empty chart
        setData(generateEmptyData())
        setIsLoading(false)
        return
      }

      const statsJson = await statsRes.json()

      if (statsJson.data && Array.isArray(statsJson.data)) {
        setData(statsJson.data)
      } else {
        setData(generateEmptyData())
      }

      setIsLoading(false)
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === "AbortError") {
        setError("Request timed out")
      } else {
        setError("Failed to load chart data")
      }
      setData(generateEmptyData())
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
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="flex flex-col items-center justify-center h-48 sm:h-[250px] gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8 opacity-50" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2 bg-transparent">
              <RefreshCw className="h-3 w-3" />
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base">Platform Activity</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Last 7 days</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            className="gap-2 bg-transparent text-xs h-7 sm:h-8"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <Tabs defaultValue="claims">
          <TabsList className="mb-3 sm:mb-4 h-7 sm:h-9">
            <TabsTrigger value="claims" className="text-xs sm:text-sm px-2 sm:px-3">
              Claims
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm px-2 sm:px-3">
              Users
            </TabsTrigger>
            <TabsTrigger value="satoshis" className="text-xs sm:text-sm px-2 sm:px-3">
              Satoshis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claims">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="claimsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="claims"
                  stroke="#8884d8"
                  fill="url(#claimsGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="users">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="#82ca9d"
                  fill="url(#usersGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="satoshis">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="satoshisGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="satoshis"
                  stroke="#fbbf24"
                  fill="url(#satoshisGradient)"
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
