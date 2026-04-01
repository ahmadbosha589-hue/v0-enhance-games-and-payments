"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, TrendingUp, Zap } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
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
  faucetpay: "text-blue-400",
  ccpayment: "text-emerald-400",
  cwallet: "text-amber-400",
  direct: "text-violet-400",
}

function maskUsername(username: string): string {
  if (!username || username.length < 4) return username || "User"
  return username.slice(0, 2) + "***" + username.slice(-2)
}

export function LiveWithdrawals({ className }: { className?: string }) {
  const [visibleWithdrawals, setVisibleWithdrawals] = useState<Withdrawal[]>([])
  
  const { data } = useSWR<{ withdrawals: Withdrawal[] }>(
    "/api/withdrawals/recent?limit=15",
    fetcher,
    {
      refreshInterval: 20000,
      revalidateOnFocus: false,
      fallbackData: { withdrawals: [] }
    }
  )

  const withdrawals = data?.withdrawals || []

  useEffect(() => {
    if (withdrawals.length === 0) return
    
    // Show first 5 immediately
    setVisibleWithdrawals(withdrawals.slice(0, 5))
    
    // Cycle through withdrawals
    let currentIndex = 5
    const interval = setInterval(() => {
      if (withdrawals.length <= 5) return
      
      setVisibleWithdrawals(prev => {
        const newWithdrawals = [...prev.slice(1)]
        const nextWithdrawal = withdrawals[currentIndex % withdrawals.length]
        newWithdrawals.push(nextWithdrawal)
        return newWithdrawals
      })
      
      currentIndex = (currentIndex + 1) % withdrawals.length
    }, 3000)

    return () => clearInterval(interval)
  }, [withdrawals])

  if (withdrawals.length === 0) {
    return null
  }

  return (
    <section className={cn("py-8 sm:py-12 border-y border-border/50 bg-muted/30", className)}>
      <div className="container px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs sm:text-sm font-medium text-green-500">Live Withdrawals</span>
          </div>
        </div>

        {/* Scrolling withdrawals */}
        <div className="relative overflow-hidden">
          <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
            <AnimatePresence mode="popLayout">
              {visibleWithdrawals.map((withdrawal, index) => (
                <motion.div
                  key={`${withdrawal.id}-${index}`}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    "bg-card/80 backdrop-blur-sm border border-border/50",
                    "hover:border-green-500/30 hover:bg-green-500/5 transition-colors",
                    index === 0 && "ring-1 ring-green-500/30"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <UserTierBadgeCompact tier={withdrawal.user_tier || "none"} />
                  <span className="text-xs font-medium">
                    {maskUsername(withdrawal.username)}
                  </span>
                  <span className="text-xs text-muted-foreground">withdrew</span>
                  <span className={cn(
                    "text-xs font-bold",
                    METHOD_COLORS[withdrawal.method?.toLowerCase()] || "text-foreground"
                  )}>
                    {withdrawal.amount?.toLocaleString()} {withdrawal.currency || "sats"}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 mt-6 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="font-medium">{withdrawals.length}+ withdrawals today</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="font-medium">Instant payouts</span>
          </div>
        </div>
      </div>
    </section>
  )
}
