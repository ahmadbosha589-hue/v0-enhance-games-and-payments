"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Heart, Wifi, WifiOff, TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FaucetHealthData {
  healthPercentage: number
  healthStatus: "healthy" | "moderate" | "low" | "critical" | "unknown"
  balanceSatoshis: number
  balanceBTC: number
  faucetPayConnected: boolean
  faucetPayError?: string | null
  thresholds?: {
    critical: number
    low: number
    moderate: number
    healthy: number
  }
  timestamp?: string
}

function formatSatoshis(satoshis: number): string {
  if (satoshis >= 100_000_000) {
    return `${(satoshis / 100_000_000).toFixed(4)} BTC`
  }
  if (satoshis >= 1_000_000) {
    return `${(satoshis / 1_000_000).toFixed(2)}M sats`
  }
  if (satoshis >= 1_000) {
    return `${(satoshis / 1_000).toFixed(1)}K sats`
  }
  return `${satoshis} sats`
}

export function AdminFaucetHealthCard() {
  const [data, setData] = useState<FaucetHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchHealth = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const response = await fetch("/api/faucet-health", {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Failed to fetch faucet health:", error)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchHealth()
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
      case "moderate":
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
      case "low":
        return "bg-orange-500/20 text-orange-500 border-orange-500/30"
      case "critical":
        return "bg-red-500/20 text-red-500 border-red-500/30"
      default:
        return "bg-muted text-muted-foreground border-muted"
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "healthy":
        return "Healthy"
      case "moderate":
        return "Moderate"
      case "low":
        return "Low Balance"
      case "critical":
        return "Critical"
      case "unknown":
        return "Unknown"
      default:
        return status
    }
  }

  const getProgressColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-emerald-500"
      case "moderate":
        return "bg-yellow-500"
      case "low":
        return "bg-orange-500"
      case "critical":
        return "bg-red-500"
      default:
        return "bg-muted-foreground/50"
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">FaucetPay Health</CardTitle>
          <Heart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-lg sm:text-2xl font-bold text-muted-foreground">--</div>
          <p className="text-xs text-muted-foreground mt-1">Unable to fetch health data</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Heart className="h-4 w-4" />
            FaucetPay Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", getStatusBadgeVariant(data.healthStatus))}>
              {getStatusLabel(data.healthStatus)}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh health data</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="flex items-center gap-2">
            <div className="text-lg sm:text-2xl font-bold">{data.healthPercentage}%</div>
            <Tooltip>
              <TooltipTrigger>
                {data.faucetPayConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{data.faucetPayConnected ? "FaucetPay API Connected" : "FaucetPay Not Connected"}</p>
                {data.faucetPayError && <p className="text-xs text-red-400">{data.faucetPayError}</p>}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {data.faucetPayConnected ? (
              <>
                {data.healthPercentage >= 50 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <p className="text-xs text-muted-foreground">{formatSatoshis(data.balanceSatoshis)} reserve</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Connect FaucetPay API for balance</p>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all duration-500", getProgressColor(data.healthStatus))}
              style={{ width: `${data.healthPercentage}%` }}
            />
          </div>
          {data.thresholds && data.faucetPayConnected && (
            <p className="text-[10px] text-muted-foreground mt-1">
              100% = {(data.thresholds.healthy / 100_000_000).toFixed(3)} BTC
            </p>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
