"use client"

import { useMemo } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface ChartData {
  date: string
  fullDate: string
  earnings: number
}

interface BalanceChartProps {
  initialData: ChartData[]
}

export function BalanceChart({ initialData }: BalanceChartProps) {
  const data = initialData || []

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