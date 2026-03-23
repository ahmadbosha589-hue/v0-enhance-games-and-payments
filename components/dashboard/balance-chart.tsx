"use client"

import { useEffect, useState, useMemo } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"

interface BalanceChartProps {
  userId: string
}

interface ChartData {
  date: string
  fullDate: string
  earnings: number
}

export function BalanceChart({ userId }: BalanceChartProps) {
  const [data, setData] = useState<ChartData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Don't fetch until we have a real userId
    if (!userId) {
      setIsLoading(false)
      return
    }

    let mounted = true
    setIsLoading(true)
    setError(false)

    async function fetchData() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)

        const res = await fetch("/api/user/earnings-chart", {
          credentials: "include",
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) {
          if (mounted) { setError(true); setIsLoading(false) }
          return
        }

        const json = await res.json()

        if (mounted) {
          setData(json.data || [])
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          // AbortError = timeout, just show empty — don't show error UI
          setData([])
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => { mounted = false }
  }, [userId])

  const { totalEarnings, trend, trendPercentage } = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.earnings, 0)
    const firstHalf = data.slice(0, 3).reduce((sum, d) => sum + d.earnings, 0)
    const secondHalf = data.slice(3).reduce((sum, d) => sum + d.earnings, 0)

    let trendDir: "up" | "down" | "neutral" = "neutral"
    let pct = 0

    if (firstHalf > 0 && secondHalf > firstHalf) {
      trendDir = "up"
      pct = ((secondHalf - firstHalf) / firstHalf) * 100
    } else if (firstHalf > 0 && secondHalf < firstHalf) {
      trendDir = "down"
      pct = ((firstHalf - secondHalf) / firstHalf) * 100
    }

    return { totalEarnings: total, trend: trendDir, trendPercentage: pct }
  }, [data])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-[180px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center text-center gap-2">
        <RefreshCw className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Unable to load chart</p>
        <button
          onClick={() => { setError(false); setIsLoading(true); setData([]) }}
          className="text-xs text-primary underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (data.every((d) => d.earnings === 0)) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center text-center" role="status">
        <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No earnings data yet</p>
        <p className="text-xs text-muted-foreground/70">Start claiming to see your progress!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tabular-nums">{totalEarnings.toLocaleString()} sats</p>
          <p className="text-xs text-muted-foreground">Total this week</p>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${trend === "up"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : trend === "down"
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }`}
        >
          {trend === "up" ? (
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
          ) : trend === "down" ? (
            <TrendingDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Minus className="h-3 w-3" aria-hidden="true" />
          )}
          <span>{trendPercentage > 0 ? `${trendPercentage.toFixed(0)}%` : "Stable"}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180} role="img" aria-label="Weekly earnings chart">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`)}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-popover p-2.5 shadow-lg">
                    <p className="text-xs text-muted-foreground">{payload[0].payload.fullDate}</p>
                    <p className="text-sm font-semibold">{payload[0].value?.toLocaleString()} sats</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}