"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket, Clock, Sparkles, Gift, TrendingUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Launch date - set this to your actual launch date
const LAUNCH_DATE = new Date("2026-04-01T00:00:00Z")
const LAUNCH_BONUS_DURATION_DAYS = 7
const LAUNCH_BONUS_PERCENTAGE = 10

interface LaunchBonusBannerProps {
  className?: string
  compact?: boolean
}

export function LaunchBonusBanner({ className, compact = false }: LaunchBonusBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const checkBonus = () => {
      const now = new Date()
      const bonusEndDate = new Date(LAUNCH_DATE)
      bonusEndDate.setDate(bonusEndDate.getDate() + LAUNCH_BONUS_DURATION_DAYS)

      if (now < bonusEndDate) {
        setIsActive(true)
        const diff = bonusEndDate.getTime() - now.getTime()
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeRemaining({ days, hours, minutes, seconds })
      } else {
        setIsActive(false)
        setTimeRemaining(null)
      }
    }

    checkBonus()
    const interval = setInterval(checkBonus, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!isActive || dismissed) return null

  if (compact) {
    return (
      <div className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 rounded-lg",
        "bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20",
        "border border-amber-500/30",
        className
      )}>
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-amber-500 animate-pulse" />
          <span className="text-xs font-medium">
            Launch Bonus: <span className="text-amber-500">+{LAUNCH_BONUS_PERCENTAGE}%</span> on all earnings
          </span>
        </div>
        {timeRemaining && (
          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">
            {timeRemaining.days}d {timeRemaining.hours}h left
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={cn(
      "relative overflow-hidden border-amber-500/50",
      "bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10",
      className
    )}>
      {/* Animated background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
      
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>

      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Icon */}
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-amber-500/20 ring-2 ring-amber-500/30 shrink-0">
            <Rocket className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500 animate-bounce" />
          </div>

          {/* Content */}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">
                Launch Bonus Active!
              </h3>
              <Badge className="bg-amber-500 text-white">
                <Sparkles className="h-3 w-3 mr-1" />
                +{LAUNCH_BONUS_PERCENTAGE}% Earnings
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Celebrate our launch with <span className="text-amber-500 font-semibold">+{LAUNCH_BONUS_PERCENTAGE}% bonus</span> on 
              all earnings including faucet claims, offerwalls, shortlinks, PTC ads, and more!
            </p>

            {/* Bonus details */}
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gift className="h-3.5 w-3.5 text-green-500" />
                <span>Faucet +{LAUNCH_BONUS_PERCENTAGE}%</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                <span>Offerwalls +{LAUNCH_BONUS_PERCENTAGE}%</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                <span>All Earnings +{LAUNCH_BONUS_PERCENTAGE}%</span>
              </div>
            </div>
          </div>

          {/* Countdown */}
          {timeRemaining && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock className="h-4 w-4 text-amber-500" />
              <div className="flex gap-1 text-center">
                <div className="flex flex-col items-center bg-black/20 rounded px-2 py-1">
                  <span className="text-lg font-bold text-amber-500">{timeRemaining.days}</span>
                  <span className="text-[10px] text-muted-foreground">days</span>
                </div>
                <span className="text-amber-500 self-center">:</span>
                <div className="flex flex-col items-center bg-black/20 rounded px-2 py-1">
                  <span className="text-lg font-bold text-amber-500">{timeRemaining.hours.toString().padStart(2, '0')}</span>
                  <span className="text-[10px] text-muted-foreground">hrs</span>
                </div>
                <span className="text-amber-500 self-center">:</span>
                <div className="flex flex-col items-center bg-black/20 rounded px-2 py-1">
                  <span className="text-lg font-bold text-amber-500">{timeRemaining.minutes.toString().padStart(2, '0')}</span>
                  <span className="text-[10px] text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Hook to get launch bonus multiplier
export function useLaunchBonus() {
  const [multiplier, setMultiplier] = useState(1)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const checkBonus = () => {
      const now = new Date()
      const bonusEndDate = new Date(LAUNCH_DATE)
      bonusEndDate.setDate(bonusEndDate.getDate() + LAUNCH_BONUS_DURATION_DAYS)

      if (now < bonusEndDate) {
        setIsActive(true)
        setMultiplier(1 + LAUNCH_BONUS_PERCENTAGE / 100)
      } else {
        setIsActive(false)
        setMultiplier(1)
      }
    }

    checkBonus()
    // Check every minute
    const interval = setInterval(checkBonus, 60000)
    return () => clearInterval(interval)
  }, [])

  return { multiplier, isActive, bonusPercentage: LAUNCH_BONUS_PERCENTAGE }
}
