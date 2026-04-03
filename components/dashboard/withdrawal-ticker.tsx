"use client"

import { useEffect, useState, useRef } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Wallet, Coins, ExternalLink } from "lucide-react"
import { UserTierBadgeCompact, type UserTier } from "@/components/ui/user-tier-badge"

interface Withdrawal {
  id: string
  username: string
  amount: number
  currency: string
  method: string
  created_at: string
  user_tier?: UserTier
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const METHOD_COLORS: Record<string, string> = {
  faucetpay: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  ccpayment: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  cwallet: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  direct: "bg-violet-500/10 text-violet-500 border-violet-500/20",
}

const METHOD_LABELS: Record<string, string> = {
  faucetpay: "FaucetPay",
  ccpayment: "CCPayment",
  cwallet: "CWallet",
  direct: "Direct",
}

function maskUsername(username: string): string {
  if (!username || username.length < 4) return username || "User"
  return username.slice(0, 2) + "***" + username.slice(-2)
}

function formatTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function WithdrawalTicker({ className }: { className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [totalWithdrawn, setTotalWithdrawn] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useSWR<{ withdrawals: Withdrawal[] }>(
    "/api/withdrawals/recent",
    fetcher,
    {
      refreshInterval: 15000, // Faster refresh for more live feeling
      revalidateOnFocus: true,
      dedupingInterval: 10000,
      fallbackData: { withdrawals: [] }
    }
  )

  const withdrawals = data?.withdrawals || []

  // Calculate total withdrawn
  useEffect(() => {
    if (withdrawals.length > 0) {
      const total = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0)
      setTotalWithdrawn(total)
    }
  }, [withdrawals])

  useEffect(() => {
    if (withdrawals.length <= 1) return

    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % withdrawals.length)
        setIsAnimating(false)
      }, 300)
    }, 3500) // Slightly faster rotation

    return () => clearInterval(interval)
  }, [withdrawals.length])

  if (isLoading || error || withdrawals.length === 0) {
    return null
  }

  const currentWithdrawal = withdrawals[currentIndex]
  const methodColor = METHOD_COLORS[currentWithdrawal.method?.toLowerCase()] || METHOD_COLORS.faucetpay
  const methodLabel = METHOD_LABELS[currentWithdrawal.method?.toLowerCase()] || currentWithdrawal.method
  const isNewest = currentIndex === 0 && withdrawals.length > 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-xl border",
        "bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-green-500/5",
        "border-green-500/20 p-3 sm:p-4",
        isNewest && "ring-1 ring-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="shrink-0 p-2 rounded-lg bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
        </div>

        {/* Content */}
        <div
          className={cn(
            "flex-1 min-w-0 transition-all duration-300",
            isAnimating && "opacity-0 -translate-y-2"
          )}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <UserTierBadgeCompact tier={currentWithdrawal.user_tier || "none"} />
            <span className="text-xs sm:text-sm font-medium text-green-600 dark:text-green-400">
              {maskUsername(currentWithdrawal.username)} withdrew
            </span>
            <span className="text-sm sm:text-base font-bold">
              {currentWithdrawal.amount?.toLocaleString()} {currentWithdrawal.currency || "sats"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span>{formatTimeAgo(currentWithdrawal.created_at)}</span>
            <span className="text-muted-foreground/50">•</span>
            <Badge variant="outline" className={cn("text-[10px] py-0 h-5", methodColor)}>
              {methodLabel}
            </Badge>
          </div>
        </div>

        {/* Stats & Indicator dots */}
        <div className="hidden sm:flex flex-col items-end gap-1">
          {totalWithdrawn > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Coins className="h-3 w-3" />
              <span>{totalWithdrawn.toLocaleString()} total</span>
            </div>
          )}
          {withdrawals.length > 1 && (
            <div className="flex items-center gap-1">
              {withdrawals.slice(0, 5).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-300",
                    i === currentIndex ? "bg-green-500 w-3" : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Expanded ticker that shows multiple recent withdrawals in a scrolling list
export function WithdrawalTickerExpanded({ className }: { className?: string }) {
  const { data, isLoading, error } = useSWR<{ withdrawals: Withdrawal[] }>(
    "/api/withdrawals/recent?limit=10",
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      fallbackData: { withdrawals: [] }
    }
  )

  const withdrawals = data?.withdrawals || []

  if (isLoading || error || withdrawals.length === 0) {
    return null
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">Recent Withdrawals</span>
        <Badge variant="secondary" className="text-[10px]">Live</Badge>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {withdrawals.map((withdrawal, i) => {
          const methodColor = METHOD_COLORS[withdrawal.method?.toLowerCase()] || METHOD_COLORS.faucetpay
          const methodLabel = METHOD_LABELS[withdrawal.method?.toLowerCase()] || withdrawal.method

          return (
            <div
              key={withdrawal.id}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border bg-card/50",
                "hover:bg-muted/50 transition-colors",
                i === 0 && "animate-pulse border-green-500/30"
              )}
              style={{ animationDuration: i === 0 ? "2s" : undefined }}
            >
              <div className="p-1.5 rounded-md bg-green-500/10 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <UserTierBadgeCompact tier={withdrawal.user_tier || "none"} />
                  <span className="text-xs font-medium truncate">
                    {maskUsername(withdrawal.username)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(withdrawal.created_at)}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs sm:text-sm font-bold text-green-500">
                  {withdrawal.amount?.toLocaleString()} {withdrawal.currency || "sats"}
                </p>
                <Badge variant="outline" className={cn("text-[9px] py-0 h-4", methodColor)}>
                  {methodLabel}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
