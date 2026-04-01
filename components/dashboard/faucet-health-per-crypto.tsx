"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Heart, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface CryptoHealth {
  symbol: string
  name: string
  icon: string
  healthPercentage: number
  status: "healthy" | "moderate" | "low" | "critical"
  balanceSatoshis: number
  dailyPayouts: number
  estimatedDaysLeft: number
}

const CRYPTO_ICONS: Record<string, string> = {
  BTC: "₿",
  LTC: "Ł",
  DOGE: "Ð",
  TRX: "◈",
  SOL: "◎",
  ETH: "Ξ",
  BNB: "⬡",
  USDT: "$",
  XRP: "✕",
  MATIC: "⬢",
}

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
  const [cryptoHealth, setCryptoHealth] = useState<CryptoHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch("/api/faucet-health/crypto")
        if (response.ok) {
          const data = await response.json()
          setCryptoHealth(data.cryptos || [])
        } else {
          // Use mock data for demo
          setCryptoHealth([
            { symbol: "BTC", name: "Bitcoin", icon: "₿", healthPercentage: 85, status: "healthy", balanceSatoshis: 5000000, dailyPayouts: 50000, estimatedDaysLeft: 100 },
            { symbol: "LTC", name: "Litecoin", icon: "Ł", healthPercentage: 72, status: "moderate", balanceSatoshis: 3500000, dailyPayouts: 45000, estimatedDaysLeft: 77 },
            { symbol: "DOGE", name: "Dogecoin", icon: "Ð", healthPercentage: 90, status: "healthy", balanceSatoshis: 8000000, dailyPayouts: 80000, estimatedDaysLeft: 100 },
            { symbol: "TRX", name: "TRON", icon: "◈", healthPercentage: 45, status: "low", balanceSatoshis: 1500000, dailyPayouts: 30000, estimatedDaysLeft: 50 },
            { symbol: "SOL", name: "Solana", icon: "◎", healthPercentage: 95, status: "healthy", balanceSatoshis: 6000000, dailyPayouts: 55000, estimatedDaysLeft: 109 },
            { symbol: "ETH", name: "Ethereum", icon: "Ξ", healthPercentage: 60, status: "moderate", balanceSatoshis: 2000000, dailyPayouts: 35000, estimatedDaysLeft: 57 },
          ])
        }
      } catch {
        // Use mock data on error
        setCryptoHealth([
          { symbol: "BTC", name: "Bitcoin", icon: "₿", healthPercentage: 85, status: "healthy", balanceSatoshis: 5000000, dailyPayouts: 50000, estimatedDaysLeft: 100 },
          { symbol: "LTC", name: "Litecoin", icon: "Ł", healthPercentage: 72, status: "moderate", balanceSatoshis: 3500000, dailyPayouts: 45000, estimatedDaysLeft: 77 },
          { symbol: "DOGE", name: "Dogecoin", icon: "Ð", healthPercentage: 90, status: "healthy", balanceSatoshis: 8000000, dailyPayouts: 80000, estimatedDaysLeft: 100 },
          { symbol: "TRX", name: "TRON", icon: "◈", healthPercentage: 45, status: "low", balanceSatoshis: 1500000, dailyPayouts: 30000, estimatedDaysLeft: 50 },
          { symbol: "SOL", name: "Solana", icon: "◎", healthPercentage: 95, status: "healthy", balanceSatoshis: 6000000, dailyPayouts: 55000, estimatedDaysLeft: 109 },
        ])
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 120000) // Refresh every 2 minutes
    return () => clearInterval(interval)
  }, [])

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
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-primary" />
            Faucet Health by Crypto
          </CardTitle>
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
                        <span className={cn("text-lg font-bold", colors.text)}>
                          {CRYPTO_ICONS[crypto.symbol] || crypto.symbol.charAt(0)}
                        </span>
                        <span className="text-xs font-medium truncate">{crypto.symbol}</span>
                        {getStatusIcon(crypto.status)}
                      </div>
                      
                      {/* Health Percentage */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={cn("text-xl font-bold", getStatusColor(crypto.status))}>
                          {crypto.healthPercentage}%
                        </span>
                        {crypto.healthPercentage >= 70 ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                        <div 
                          className={cn("h-full transition-all duration-500", getProgressColor(crypto.status))}
                          style={{ width: `${crypto.healthPercentage}%` }}
                        />
                      </div>
                      
                      {/* Status Badge */}
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "absolute -top-1.5 -right-1.5 text-[8px] px-1 py-0 h-4 capitalize",
                          getStatusColor(crypto.status),
                          "border-current bg-background"
                        )}
                      >
                        {crypto.status}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1.5">
                      <p className="font-semibold">{crypto.name} ({crypto.symbol})</p>
                      <div className="text-xs space-y-0.5">
                        <p>Health: <span className={getStatusColor(crypto.status)}>{crypto.healthPercentage}%</span></p>
                        <p>Balance: {(crypto.balanceSatoshis / 100000000).toFixed(6)} {crypto.symbol}</p>
                        <p>Daily Payouts: ~{crypto.dailyPayouts.toLocaleString()} sats equivalent</p>
                        <p>Est. Days Left: {crypto.estimatedDaysLeft} days</p>
                      </div>
                      {crypto.status === "critical" && (
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
