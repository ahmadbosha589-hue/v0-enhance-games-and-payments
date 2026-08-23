"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Bot,
  ShieldAlert,
  MousePointerClick,
  Heart,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  ShieldBan,
  AlertCircle,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface FaucetHealthData {
  healthPercentage: number
  healthStatus: "healthy" | "moderate" | "low" | "critical" | "unknown"
  balanceSatoshis: number
  balanceBTC: number
  faucetPayConnected: boolean
  faucetPayError?: string | null
  totalBotsBlocked: number
  botsBlockedToday: number
  vpnProxyBlocked: number
  adblockUsers: number
  suspiciousClaimsBlocked: number
  totalFraudFlags: number
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

// Thresholds render in satoshis, not BTC: "0.001 BTC" read like a deposit
// instruction to users. Sats make it clearly an internal ops metric.
function formatThreshold(sats: number): string {
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(1)}M sats`
  }
  if (sats >= 10_000) {
    return `${(sats / 1_000).toFixed(0)}K sats`
  }
  return `${sats.toLocaleString()} sats`
}

export function FaucetHealth() {
  const [data, setData] = useState<FaucetHealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch("/api/faucet-health")
        if (response.ok) {
          const result = await response.json()
          setData(result)
        }
      } catch (error) {
        console.error("Failed to fetch faucet health:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-4">
          <div className="h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-500"
      case "moderate":
        return "text-yellow-500"
      case "low":
        return "text-orange-500"
      case "critical":
        return "text-red-500"
      case "unknown":
        return "text-muted-foreground"
      default:
        return "text-muted-foreground"
    }
  }

  const getProgressColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500"
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

  const getHealthStatusText = (status: string) => {
    switch (status) {
      case "healthy":
        return "Healthy"
      case "moderate":
        return "Moderate"
      case "low":
        return "Low"
      case "critical":
        return "Critical"
      case "unknown":
        return "Unknown"
      default:
        return status
    }
  }

  const getRecommendation = (_status: string, thresholds?: FaucetHealthData["thresholds"]) => {
    if (!thresholds) return null
    // This card is informational: it reflects the PLATFORM's payout-wallet
    // reserve, not anything the user does. Never phrase it as a user action
    // ("top up" read like a deposit instruction).
    switch (_status) {
      case "critical":
        return "Platform payout reserve — claims continue normally"
      case "low":
        return "Platform payout reserve — claims continue normally"
      case "moderate":
        return "Payout reserves are stable — no action needed"
      case "healthy":
        return "Payout reserves are fully stocked — all systems nominal"
      default:
        return "Live platform payout status"
    }
  }

  const stats = [
    {
      icon: Bot,
      label: "Bots Blocked",
      value: data.totalBotsBlocked,
      subValue: `+${data.botsBlockedToday} today`,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      tooltip: "Total bot accounts detected and blocked by our anti-fraud system",
    },
    {
      icon: ShieldAlert,
      label: "VPN/Proxy",
      value: data.vpnProxyBlocked,
      subValue: "blocked",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      tooltip: "VPN, proxy, and Tor connections blocked to prevent abuse",
    },
    {
      icon: ShieldBan,
      label: "Adblock Users",
      value: data.adblockUsers,
      subValue: "flagged",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      tooltip: "Users flagged for using adblockers",
    },
    {
      icon: MousePointerClick,
      label: "Suspicious",
      value: data.suspiciousClaimsBlocked,
      subValue: "claims",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      tooltip: "Claims blocked due to high fraud score",
    },
  ]

  return (
    <TooltipProvider>
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-4">
          {/* Faucet Health Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Heart className={cn("h-4 w-4", getHealthColor(data.healthStatus))} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Faucet Health</h3>
                <p className={cn("text-xs font-medium capitalize", getHealthColor(data.healthStatus))}>
                  {getHealthStatusText(data.healthStatus)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Tooltip>
                  <TooltipTrigger>
                    {data.faucetPayConnected ? (
                      <Wifi className="h-3 w-3 text-green-500" />
                    ) : (
                      <WifiOff className="h-3 w-3 text-muted-foreground" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{data.faucetPayConnected ? "FaucetPay Connected" : "FaucetPay Not Configured"}</p>
                    {data.faucetPayError && <p className="text-xs text-red-400 mt-1">{data.faucetPayError}</p>}
                  </TooltipContent>
                </Tooltip>
                <p className="text-2xl font-bold">{data.healthPercentage}%</p>
              </div>
              <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                {data.faucetPayConnected ? (
                  <>
                    {data.healthPercentage >= 50 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span title="Platform payout wallet reserve — not your balance">
                      {formatSatoshis(data.balanceSatoshis)} reserve
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    Balance unavailable
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
              <div
                className={cn("h-full transition-all duration-500", getProgressColor(data.healthStatus))}
                style={{ width: `${data.healthPercentage}%` }}
              />
            </div>
            {data.thresholds && data.faucetPayConnected && (
              <div className="relative h-1 w-full">
                <div
                  className="absolute top-0 w-px h-2 bg-red-500/50"
                  style={{ left: `${(data.thresholds.critical / data.thresholds.healthy) * 100}%` }}
                  title="Critical threshold"
                />
                <div
                  className="absolute top-0 w-px h-2 bg-orange-500/50"
                  style={{ left: `${(data.thresholds.low / data.thresholds.healthy) * 100}%` }}
                  title="Low threshold"
                />
                <div
                  className="absolute top-0 w-px h-2 bg-yellow-500/50"
                  style={{ left: `${(data.thresholds.moderate / data.thresholds.healthy) * 100}%` }}
                  title="Moderate threshold"
                />
              </div>
            )}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">
                      {getRecommendation(data.healthStatus, data.thresholds)}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Platform Reserve Tiers</p>
                    <p className="text-muted-foreground">
                      Internal payout-wallet levels &mdash; your balance and claims are unaffected.
                    </p>
                    {data.thresholds && (
                      <>
                        <p>
                          <span className="text-red-500">Critical:</span> Below{" "}
                          {formatThreshold(data.thresholds.critical)}
                        </p>
                        <p>
                          <span className="text-orange-500">Low:</span> {formatThreshold(data.thresholds.critical)} -{" "}
                          {formatThreshold(data.thresholds.low)}
                        </p>
                        <p>
                          <span className="text-yellow-500">Moderate:</span> {formatThreshold(data.thresholds.low)} -{" "}
                          {formatThreshold(data.thresholds.moderate)}
                        </p>
                        <p>
                          <span className="text-green-500">Healthy:</span> {formatThreshold(data.thresholds.moderate)}+
                        </p>
                      </>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Anti-Bot & Anti-Clicker Stats */}
          <div className="grid grid-cols-4 gap-2">
            {stats.map((stat) => (
              <Tooltip key={stat.label}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50 text-center cursor-help transition-colors hover:bg-muted">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-full mb-1", stat.bgColor)}>
                      <stat.icon className={cn("h-3.5 w-3.5", stat.color)} />
                    </div>
                    <p className="text-sm font-bold">{stat.value.toLocaleString()}</p>
                    <p className="text-[8px] text-muted-foreground leading-tight">{stat.label}</p>
                    <p className="text-[7px] text-muted-foreground">{stat.subValue}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{stat.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 pt-2 border-t">
            <ShieldAlert className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">
              Protected by Cloudflare Turnstile + Advanced Fraud Detection
            </p>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

export function useFaucetHealth() {
  const [data, setData] = useState<FaucetHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch("/api/faucet-health")
        if (response.ok) {
          const result = await response.json()
          setData(result)
          setError(null)
        } else {
          setError("Failed to fetch health data")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error, refetch: () => setLoading(true) }
}
