"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Heart, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { CryptoIcon } from "@/components/crypto-icon"
import useSWR from "swr"

interface CryptoHealth {
  symbol: string
  name: string
  icon: string
  healthPercentage: number
  status: "healthy" | "moderate" | "low" | "critical"
  balanceSatoshis: number
  dailyPayouts: number
  estimatedDaysLeft: number
  hasRealData?: boolean
}

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json())

const CRYPTO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  BTC: { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/30" },
  LTC: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/30" },
  DOGE: { bg: "bg-yellow-500/10", text: "text-yellow-500", border: "border-yellow-500/30" },
  TRX: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/30" },
  SOL: { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/30" },
  ETH: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/30" },
  BNB: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30" },
  USDT: { bg: "bg-green-500/10", text: "text-green-500", border: "border-green-500/30" },
  XRP: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
  MATIC: { bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/30" },
}

function getStatusColor(status: string) {
  switch (status) {
    case "healthy": return "text-green-500"
    case "moderate": return "text-yellow-500"
    case "low": return "text-orange-500"
    case "critical": return "text-red-500"
    default: return "text-muted-foreground"
  }
}

function getProgressColor(status: string) {
  switch (status) {
    case "healthy": return "bg-green-500"
    case "moderate": return "bg-yellow-500"
    case "low": return "bg-orange-500"
    case "critical": return "bg-red-500"
    default: return "bg-muted-foreground"
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy": return <CheckCircle2 className="h-3 w-3 text-green-500" />
    case "moderate": return <AlertCircle className="h-3 w-3 text-yellow-500" />
    case "low": return <AlertCircle className="h-3 w-3 text-orange-500" />
    case "critical": return <AlertCircle className="h-3 w-3 text-red-500 animate-pulse" />
    default: return <Info className="h-3 w-3 text-muted-foreground" />
  }
}

interface FaucetHealthPerCryptoProps {
  className?: string
}

export function FaucetHealthPerCrypto({ className }: FaucetHealthPerCryptoProps) {
  // Use SWR for better caching and background revalidation - NO fake fallback data
  const { data, isLoading, error } = useSWR<{ cryptos: CryptoHealth[]; source: string; error?: string; timestamp: string }>(
    "/api/faucet-health/crypto",
    fetcher,
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: false,
      dedupingInterval: 30000, // Dedupe requests within 30 seconds
      errorRetryCount: 3,
      // No fallbackData - show loading state until real data arrives
    }
  )

  const cryptoHealth = data?.cryptos || []
  const dataSource = data?.source || "loading"
  const hasError = data?.error || error
  const loading = isLoading && !data

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (cryptoHealth.length === 0) return null

  return (
    <TooltipProvider>
      <Card className={cn("border-primary/20", className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-4 w-4 text-primary" />
              Faucet Health by Crypto
            </CardTitle>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5",
                dataSource === "faucetpay" ? "text-green-500 border-green-500/30" :
                  dataSource === "database" ? "text-blue-500 border-blue-500/30" :
                    dataSource === "error" ? "text-red-500 border-red-500/30" :
                      "text-muted-foreground"
              )}
            >
              {dataSource === "faucetpay" ? "Live" :
                dataSource === "database" ? "Database" :
                  dataSource === "error" ? "Error" : "Loading"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {cryptoHealth.map((crypto) => {
              const colors = CRYPTO_COLORS[crypto.symbol] || { bg: "bg-muted", text: "text-foreground", border: "border-muted" }

              return (
                <Tooltip key={crypto.symbol}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "relative rounded-lg border p-2.5 sm:p-3 cursor-help transition-all hover:scale-[1.02]",
                        colors.border,
                        colors.bg
                      )}
                    >
                      {/* Crypto Icon & Name */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <CryptoIcon symbol={crypto.symbol} size="sm" />
                        <span className="text-xs font-medium truncate">{crypto.symbol}</span>
                        {getStatusIcon(crypto.status)}
                      </div>

                      {/* Health Percentage */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={cn("text-xl font-bold",
                          crypto.hasRealData === false ? "text-muted-foreground" : getStatusColor(crypto.status)
                        )}>
                          {crypto.hasRealData === false ? "N/A" : `${crypto.healthPercentage}%`}
                        </span>
                        {crypto.hasRealData !== false && (
                          crypto.healthPercentage >= 70 ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                        {crypto.hasRealData === false ? (
                          <div className="h-full w-full bg-muted-foreground/30 animate-pulse" />
                        ) : (
                          <div
                            className={cn("h-full transition-all duration-500", getProgressColor(crypto.status))}
                            style={{ width: `${crypto.healthPercentage}%` }}
                          />
                        )}
                      </div>

                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "absolute -top-1.5 -right-1.5 text-[8px] px-1 py-0 h-4 capitalize",
                          crypto.hasRealData === false ? "text-muted-foreground" : getStatusColor(crypto.status),
                          "border-current bg-background"
                        )}
                      >
                        {crypto.hasRealData === false ? "Unknown" : crypto.status}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1.5">
                      <p className="font-semibold">{crypto.name} ({crypto.symbol})</p>
                      {crypto.hasRealData === false ? (
                        <div className="text-xs text-amber-500">
                          <p>Balance data unavailable</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            FaucetPay API not connected or database not configured
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs space-y-0.5">
                          <p>Health: <span className={getStatusColor(crypto.status)}>{crypto.healthPercentage}%</span></p>
                          <p>Balance: {(crypto.balanceSatoshis / 100000000).toFixed(6)} {crypto.symbol}</p>
                          <p>Daily Payouts: ~{crypto.dailyPayouts.toLocaleString()} sats equivalent</p>
                          <p>Est. Days Left: {crypto.estimatedDaysLeft} days</p>
                        </div>
                      )}
                      {crypto.status === "critical" && crypto.hasRealData !== false && (
                        <p className="text-[10px] text-red-400 mt-1">
                          Low balance! Claims may fail until topped up.
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 pt-3 border-t text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Healthy (70%+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Moderate (40-70%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Low (20-40%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical (&lt;20%)</span>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
