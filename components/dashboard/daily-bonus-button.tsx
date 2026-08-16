"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Loader2, CheckCircle, Clock, Gift, AlertCircle, Play } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { FullscreenAdModal } from "@/components/ads/fullscreen-ad-modal"

interface DailyBonusButtonProps {
  className?: string
  onBalanceUpdate?: (newBalance: number) => void
}

type BonusState = "loading" | "ready" | "cooldown" | "claiming" | "success" | "error"

const BALANCE_UPDATE_EVENT = "faucero:balance-update"

export function DailyBonusButton({ className, onBalanceUpdate }: DailyBonusButtonProps) {
  const router = useRouter()
  const [state, setState] = useState<BonusState>("loading")
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [lastAmount, setLastAmount] = useState(0)
  const [totalBonuses, setTotalBonuses] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [showDoubleRewardModal, setShowDoubleRewardModal] = useState(false)
  const [canShowDoubleReward, setCanShowDoubleReward] = useState(false)

  const checkBonusStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/daily-bonus")
      const data = await response.json()

      setTotalBonuses(data.totalBonuses || 0)

      if (data.canClaim) {
        setState("ready")
        setSecondsRemaining(0)
      } else {
        setState("cooldown")
        setSecondsRemaining(data.secondsRemaining || 0)
      }
    } catch (error) {
      console.error("Failed to check daily bonus status:", error)
      setState("error")
      setErrorMessage("Failed to load")
    }
  }, [])

  useEffect(() => {
    checkBonusStatus()
  }, [checkBonusStatus])

  useEffect(() => {
    if (state !== "cooldown" || secondsRemaining <= 0) return

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setState("ready")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [state, secondsRemaining])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  const handleClaim = async () => {
    if (state !== "ready" && state !== "error") return

    setState("claiming")
    setErrorMessage("")

    try {
      const response = await fetch("/api/daily-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.secondsRemaining) {
          setSecondsRemaining(data.secondsRemaining)
          setState("cooldown")
          toast.error("Daily bonus already claimed")
          return
        }
        throw new Error(data.error || "Failed to claim")
      }

      setLastAmount(data.amount)
      setTotalBonuses(data.totalBonuses)
      setState("success")
      setCanShowDoubleReward(true) // Enable double reward button

      // Trigger confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#FFD700", "#FFA500", "#FF6347"],
      })

      toast.success(`Daily bonus claimed!`, {
        description: `You received ${data.amount} satoshis. Watch ads to double it!`,
      })

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(BALANCE_UPDATE_EVENT, {
            detail: { newBalance: data.newBalance, amount: data.amount, type: "daily_bonus" },
          }),
        )
      }

      if (onBalanceUpdate && data.newBalance) {
        onBalanceUpdate(data.newBalance)
      }

      setTimeout(() => {
        setState("cooldown")
        setSecondsRemaining(24 * 60 * 60) // 24 hours
        // Force hard refresh to update all server-rendered data
        window.location.reload()
      }, 300)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to claim bonus"
      toast.error(message)
      setState("error")
      setErrorMessage(message)
    }
  }

  const handleRetry = () => {
    setState("loading")
    setErrorMessage("")
    checkBonusStatus()
  }

  return (
    <Card
      className={`overflow-hidden border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 ${className}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <Gift className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm sm:text-base">Daily Bonus</h3>
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                  2-5 sats
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {state === "cooldown"
                  ? `Available in ${formatTime(secondsRemaining)}`
                  : state === "error"
                    ? errorMessage
                    : "Claim once every 24 hours"}
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {state === "loading" && (
              <Button disabled size="sm" className="min-w-[100px]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            )}

            {state === "ready" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <Button
                  size="sm"
                  onClick={handleClaim}
                  className="min-w-[100px] gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25"
                >
                  <Sparkles className="h-4 w-4" />
                  Claim
                </Button>
              </motion.div>
            )}

            {state === "cooldown" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <Button disabled size="sm" variant="outline" className="min-w-[100px] gap-1.5 bg-transparent">
                  <Clock className="h-4 w-4" />
                  {formatTime(secondsRemaining)}
                </Button>
              </motion.div>
            )}

            {state === "claiming" && (
              <Button disabled size="sm" className="min-w-[100px]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            )}

            {state === "success" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center gap-1"
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="min-w-[100px] gap-1.5 border-green-500 text-green-500 bg-transparent"
                >
                  <CheckCircle className="h-4 w-4" />+{lastAmount} sats
                </Button>
                {canShowDoubleReward && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDoubleRewardModal(true)
                    }}
                  >
                    <Play className="h-3 w-3" />
                    Double it! (+{lastAmount} sats)
                  </Button>
                )}
              </motion.div>
            )}

            {state === "error" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="min-w-[100px] gap-1.5 border-red-500/50 text-red-500 hover:bg-red-500/10 bg-transparent"
                >
                  <AlertCircle className="h-4 w-4" />
                  Retry
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {totalBonuses > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-500/20">
            <p className="text-xs text-muted-foreground text-center">
              You&apos;ve claimed <span className="font-semibold text-amber-600">{totalBonuses}</span> daily bonuses
            </p>
          </div>
        )}
      </CardContent>

      {/* Fullscreen Double Reward Modal */}
      <FullscreenAdModal
        isOpen={showDoubleRewardModal}
        onClose={() => {
          setShowDoubleRewardModal(false)
          setCanShowDoubleReward(false)
        }}
        type="daily_bonus"
        baseAmount={lastAmount}
        multiplier={2}
        onComplete={(bonusAmount) => {
          if (onBalanceUpdate) {
            // Trigger balance update with the bonus
            onBalanceUpdate(bonusAmount)
          }
          setCanShowDoubleReward(false)
          // Force refresh
          setTimeout(() => window.location.reload(), 1000)
        }}
        apiEndpoint="/api/daily-bonus/double"
      />
    </Card>
  )
}

export { BALANCE_UPDATE_EVENT }
