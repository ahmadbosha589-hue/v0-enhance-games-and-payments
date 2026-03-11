import type { Transaction } from "@/lib/types/database"
import { formatSatoshisDisplay, formatRelativeTime } from "@/lib/utils/format"
import {
  Coins,
  Wallet,
  Users,
  Gift,
  Settings2,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Flame,
  Award,
  Trophy,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface RecentActivityProps {
  transactions: Transaction[]
  showEmpty?: boolean
}

const typeConfig = {
  claim: {
    icon: Coins,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Claim Reward",
  },
  withdrawal: {
    icon: Wallet,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Withdrawal",
  },
  referral_bonus: {
    icon: Users,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    label: "Referral Bonus",
  },
  bonus: {
    icon: Gift,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Bonus",
  },
  daily_bonus: {
    icon: Gift,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    label: "Daily Bonus",
  },
  streak_bonus: {
    icon: Flame,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    label: "Streak Bonus",
  },
  signup_bonus: {
    icon: Award,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    label: "Signup Bonus",
  },
  achievement: {
    icon: Trophy,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    label: "Achievement Reward",
  },
  adjustment: {
    icon: Settings2,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Adjustment",
  },
}

export function RecentActivity({ transactions, showEmpty = true }: RecentActivityProps) {
  if (!transactions || transactions.length === 0) {
    if (!showEmpty) return null

    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center" role="status">
        <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-muted mb-3 sm:mb-4">
          <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm sm:text-base font-medium text-muted-foreground">No recent activity</p>
        <p className="text-xs sm:text-sm text-muted-foreground/70 mt-1">Start claiming to see your transactions here</p>
      </div>
    )
  }

  return (
    <div className="space-y-2" role="list" aria-label="Recent transactions">
      {transactions.map((tx) => {
        const config = typeConfig[tx.type] || typeConfig.adjustment
        const isPositive = tx.amount_satoshis > 0

        return (
          <div
            key={tx.id}
            className="flex items-center gap-3 rounded-lg p-2 sm:p-3 transition-colors hover:bg-muted/50 group"
            role="listitem"
          >
            <div
              className={cn(
                "flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                config.bgColor,
              )}
              aria-hidden="true"
            >
              <config.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{config.label}</p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={tx.created_at}>{formatRelativeTime(tx.created_at)}</time>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
              )}
              <span
                className={cn("text-sm font-semibold tabular-nums", isPositive ? "text-green-500" : "text-red-500")}
              >
                {isPositive ? "+" : ""}
                {formatSatoshisDisplay(Math.abs(tx.amount_satoshis))}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
