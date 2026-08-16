"use client"

import { useRealtimeProfile } from "@/lib/hooks/use-realtime-profile"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { Skeleton } from "@/components/ui/skeleton"
import { Bitcoin, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState, useRef } from "react"

interface BalanceDisplayProps {
  userId: string
  initialBalance: number // Required - no default to prevent accidental fallbacks
}

export function BalanceDisplay({ userId, initialBalance }: BalanceDisplayProps) {
  const { profile, isLoading, error } = useRealtimeProfile(userId)
  // Use ref to track previous balance to prevent animation on initial load
  const prevBalanceRef = useRef<number | null>(null)
  const [balanceChange, setBalanceChange] = useState<"increase" | "decrease" | null>(null)

  // NEVER use fallback values - always use server data
  // If profile hasn't loaded yet, use the server-provided initialBalance
  // If profile has loaded, use the realtime profile data
  const currentBalance = profile?.balance_satoshis ?? initialBalance

  useEffect(() => {
    // Only animate changes after the first load
    if (prevBalanceRef.current !== null && currentBalance !== prevBalanceRef.current) {
      setBalanceChange(currentBalance > prevBalanceRef.current ? "increase" : "decrease")

      const timer = setTimeout(() => {
        setBalanceChange(null)
      }, 2000)

      return () => clearTimeout(timer)
    }
    prevBalanceRef.current = currentBalance
  }, [currentBalance])

  if (isLoading && !profile) {
    return <Skeleton className="h-10 w-32" />
  }

  // Show error state if balance couldn't be loaded
  if (error && !profile) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">Balance unavailable</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Bitcoin className="h-5 w-5 text-primary" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Balance</span>
        <div className="flex items-center gap-1">
          <AnimatePresence mode="wait">
            <motion.span
              key={currentBalance}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`text-lg font-bold tabular-nums ${
                balanceChange === "increase" ? "text-green-500" : balanceChange === "decrease" ? "text-red-500" : ""
              }`}
            >
              {formatSatoshisDisplay(Number(currentBalance))}
            </motion.span>
          </AnimatePresence>
          {balanceChange && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
            >
              {balanceChange === "increase" ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
