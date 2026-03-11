"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface DailyData {
  date: string
  users: number
  claims: number
  satoshi: number
}

interface FraudData {
  type: string
  value: number
}

const COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"]
const COLOR_LABELS = ["Clean", "Suspicious", "High Risk", "Banned"]

export function AnalyticsCharts() {
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [fraudData, setFraudData] = useState<FraudData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalyticsData() {
      try {
        const response = await fetch("/api/admin/analytics-data")
        if (response.ok) {
          const data = await response.json()
          setDailyData(data.dailyData || [])
          setFraudData(data.fraudData || [])
        } else {
          setDailyData([])
          setFraudData([])
        }
      } catch (error) {
        console.error("Failed to fetch analytics data:", error)
        setDailyData([])
        setFraudData([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchAnalyticsData()
  }, [])

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Activity</CardTitle>
            <CardDescription>Claims and active users over the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Satoshi Distributed</CardTitle>
            <CardDescription>Daily distribution amounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>User Risk Distribution</CardTitle>
            <CardDescription>Breakdown by fraud score</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasData = dailyData.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Daily Claims */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Daily Activity</CardTitle>
          <CardDescription>Claims and active users over the past week</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="claimsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="claims"
                  stroke="hsl(var(--primary))"
                  fill="url(#claimsGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No activity data available yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distribution by Satoshi */}
      <Card>
        <CardHeader>
          <CardTitle>Satoshi Distributed</CardTitle>
          <CardDescription>Daily distribution amounts</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`${(value / 1000).toFixed(1)}k sat`, "Distributed"]}
                />
                <Bar dataKey="satoshi" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No distribution data available yet
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Risk Distribution</CardTitle>
          <CardDescription>Breakdown by fraud score</CardDescription>
        </CardHeader>
        <CardContent>
          {fraudData.length > 0 ? (
            <div className="flex flex-col gap-6">
              {/* Pie Chart */}
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={fraudData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                      if (value < 10) return null // Hide labels for small slices
                      const RADIAN = Math.PI / 180
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5 + 35
                      const x = cx + radius * Math.cos(-midAngle * RADIAN)
                      const y = cy + radius * Math.sin(-midAngle * RADIAN)
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="#ffffff"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-xs font-bold"
                          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                        >
                          {fraudData[index]?.type} {value}%
                        </text>
                      )
                    }}
                    labelLine={false}
                  >
                    {fraudData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-3 px-1">
                {fraudData.map((entry, index) => (
                  <div
                    key={entry.type}
                    className="flex items-center justify-between gap-2.5 py-2.5 px-3 rounded-lg border border-border/50 bg-muted/30"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium" style={{ color: COLORS[index % COLORS.length] }}>
                        {entry.type}
                      </span>
                    </div>
                    <span
                      className="text-sm font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-md"
                      style={{
                        backgroundColor: `${COLORS[index % COLORS.length]}30`,
                        color: COLORS[index % COLORS.length],
                      }}
                    >
                      {entry.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No risk data available yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
