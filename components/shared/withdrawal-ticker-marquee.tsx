"use client"

import { useEffect, useState, useRef } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { CheckCircle2, Bitcoin, DollarSign, Coins, CircleDollarSign } from "lucide-react"
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

// Currency icons mapping
const CURRENCY_ICONS: Record<string, React.ReactNode> = {
  btc: <Bitcoin className="h-3 w-3 text-orange-500" />,
  bitcoin: <Bitcoin className="h-3 w-3 text-orange-500" />,
  sats: <Bitcoin className="h-3 w-3 text-orange-500" />,
  satoshi: <Bitcoin className="h-3 w-3 text-orange-500" />,
  satoshis: <Bitcoin className="h-3 w-3 text-orange-500" />,
  usd: <DollarSign className="h-3 w-3 text-green-500" />,
  usdt: <CircleDollarSign className="h-3 w-3 text-green-500" />,
  default: <Coins className="h-3 w-3 text-yellow-500" />,
}

// Payment method colors
const METHOD_COLORS: Record<string, string> = {
  faucetpay: "text-blue-400",
  ccpayment: "text-emerald-400",
  cwallet: "text-amber-400",
  direct: "text-violet-400",
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

function getCurrencyIcon(currency: string) {
  const normalizedCurrency = currency?.toLowerCase() || "default"
  return CURRENCY_ICONS[normalizedCurrency] || CURRENCY_ICONS.default
}

interface WithdrawalTickerMarqueeProps {
  className?: string
  variant?: "landing" | "dashboard" | "compact"
  speed?: "slow" | "normal" | "fast"
  showHeader?: boolean
}

export function WithdrawalTickerMarquee({
  className,
  variant = "landing",
  speed = "normal",
  showHeader = true,
}: WithdrawalTickerMarqueeProps) {
  const [isPaused, setIsPaused] = useState(false)
  const marqueeRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useSWR<{ withdrawals: Withdrawal[] }>(
    "/api/withdrawals/recent?limit=20",
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: false,
      fallbackData: { withdrawals: [] },
    }
  )

  const withdrawals = data?.withdrawals || []

  // Animation speed based on prop
  const animationDuration =
    speed === "slow" ? "60s" : speed === "fast" ? "20s" : "40s"

  // Don't show anything while loading or if no withdrawals - avoids skeleton clutter
  if (isLoading || error || withdrawals.length === 0) {
    return null
  }

  // Double the withdrawals for seamless loop
  const duplicatedWithdrawals = [...withdrawals, ...withdrawals]

  return (
    <div className={cn("w-full overflow-hidden", className)}>
      {/* Header - only for landing variant */}
      {showHeader && variant === "landing" && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs sm:text-sm font-medium text-green-500">
              Live Withdrawals
            </span>
          </div>
        </div>
      )}

      {/* Compact header for dashboard */}
      {showHeader && variant === "dashboard" && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Live withdrawals
          </span>
        </div>
      )}

      {/* Marquee container */}
      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Gradient fades */}
        <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        {/* Scrolling content */}
        <div
          ref={marqueeRef}
          className={cn(
            "flex gap-3 sm:gap-4",
            !isPaused && "animate-marquee"
          )}
          style={{
            animationDuration,
            animationPlayState: isPaused ? "paused" : "running",
          }}
        >
          {duplicatedWithdrawals.map((withdrawal, index) => (
            <WithdrawalCard
              key={`${withdrawal.id}-${index}`}
              withdrawal={withdrawal}
              variant={variant}
              isNewest={index === 0}
            />
          ))}
        </div>
      </div>

      {/* Inline keyframes */}
      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee linear infinite;
        }
      `}</style>
    </div>
  )
}

// Individual withdrawal card
function WithdrawalCard({
  withdrawal,
  variant,
  isNewest,
}: {
  withdrawal: Withdrawal
  variant: "landing" | "dashboard" | "compact"
  isNewest: boolean
}) {
  const methodColor =
    METHOD_COLORS[withdrawal.method?.toLowerCase()] || "text-foreground"

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-card/80 backdrop-blur-sm border border-border/50",
          "hover:border-green-500/30 hover:bg-green-500/5 transition-colors cursor-default",
          isNewest && "ring-1 ring-green-500/30"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="text-xs font-medium">
          {maskUsername(withdrawal.username)}
        </span>
        <span className="text-xs font-bold text-green-500">
          {withdrawal.amount?.toLocaleString()} {withdrawal.currency || "sats"}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl",
        "bg-card/90 backdrop-blur-sm border border-border/50",
        "hover:border-green-500/40 hover:bg-green-500/5 hover:shadow-lg hover:shadow-green-500/5",
        "transition-all duration-200 cursor-default group",
        isNewest && "ring-1 ring-green-500/40 shadow-[0_0_10px_rgba(34,197,94,0.15)]"
      )}
    >
      {/* Success icon */}
      <div
        className={cn(
          "p-1.5 rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors",
          isNewest && "animate-pulse"
        )}
        style={{ animationDuration: "2s" }}
      >
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      </div>

      {/* User info */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <UserTierBadgeCompact tier={withdrawal.user_tier || "none"} />
          <span className="text-xs sm:text-sm font-medium">
            {maskUsername(withdrawal.username)}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTimeAgo(withdrawal.created_at)}
        </span>
      </div>

      {/* Amount */}
      <div className="flex items-center gap-1.5 pl-2 border-l border-border/50">
        {getCurrencyIcon(withdrawal.currency)}
        <span className="text-sm sm:text-base font-bold text-green-500">
          {withdrawal.amount?.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          {withdrawal.currency || "sats"}
        </span>
      </div>

      {/* Method badge - only on larger cards */}
      {variant === "landing" && (
        <span
          className={cn(
            "hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/50",
            methodColor
          )}
        >
          {withdrawal.method || "FaucetPay"}
        </span>
      )}
    </div>
  )
}

// Floating ticker for dashboard - fixed position
export function FloatingWithdrawalTicker({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-background/95 backdrop-blur-md border-t border-border/50",
        "py-2 px-4",
        "safe-bottom",
        className
      )}
    >
      <WithdrawalTickerMarquee
        variant="compact"
        speed="normal"
        showHeader={false}
      />
    </div>
  )
}
