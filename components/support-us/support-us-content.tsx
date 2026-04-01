"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Play, Pause, Heart, Coins, Clock, CheckCircle2,
  AlertCircle, TrendingUp, Gift, Timer, Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import confetti from "canvas-confetti"

interface SupportUsContentProps {
  userId: string
}

const REWARD_PER_AD = 70 // satoshis
const AD_DURATION = 60 // seconds
const ADS_PER_SESSION = 3

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function SupportUsContent({ userId }: SupportUsContentProps) {
  const [isWatching, setIsWatching] = useState(false)
  const [currentAdIndex, setCurrentAdIndex] = useState(0)
  const [adProgress, setAdProgress] = useState(0)
  const [sessionEarnings, setSessionEarnings] = useState(0)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [adsWatchedToday, setAdsWatchedToday] = useState(0)
  const [countdown, setCountdown] = useState(AD_DURATION)

  // Fetch user's support stats
  const { data: statsData } = useSWR(
    `/api/support-stats?userId=${userId}`,
    fetcher,
    { 
      refreshInterval: 60000,
      revalidateOnFocus: false,
      fallbackData: { totalEarnings: 0, adsWatchedToday: 0 }
    }
  )

  useEffect(() => {
    if (statsData) {
      setTotalEarnings(statsData.totalEarnings || 0)
      setAdsWatchedToday(statsData.adsWatchedToday || 0)
    }
  }, [statsData])

  // Ad timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isWatching && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          const newValue = prev - 1
          setAdProgress(((AD_DURATION - newValue) / AD_DURATION) * 100)
          return newValue
        })
      }, 1000)
    } else if (countdown === 0 && isWatching) {
      // Ad completed
      handleAdComplete()
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isWatching, countdown])

  const handleAdComplete = useCallback(async () => {
    const newEarnings = REWARD_PER_AD
    setSessionEarnings((prev) => prev + newEarnings)
    setTotalEarnings((prev) => prev + newEarnings)
    setAdsWatchedToday((prev) => prev + 1)

    // Check if more ads in session
    if (currentAdIndex < ADS_PER_SESSION - 1) {
      setCurrentAdIndex((prev) => prev + 1)
      setCountdown(AD_DURATION)
      setAdProgress(0)
      toast.success(`Ad ${currentAdIndex + 1} completed! +${newEarnings} sats`)
    } else {
      // Session complete
      setIsWatching(false)
      setCurrentAdIndex(0)
      setCountdown(AD_DURATION)
      setAdProgress(0)
      
      const totalSessionEarnings = sessionEarnings + newEarnings
      toast.success(`Session complete! You earned ${totalSessionEarnings} sats!`)
      
      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })

      // Record earnings (in a real implementation)
      try {
        await fetch("/api/support-us/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adsWatched: ADS_PER_SESSION,
            totalEarnings: totalSessionEarnings
          })
        })
      } catch (error) {
        console.error("Failed to record support earnings:", error)
      }

      setSessionEarnings(0)
    }
  }, [currentAdIndex, sessionEarnings])

  const startWatching = () => {
    setIsWatching(true)
    setCurrentAdIndex(0)
    setCountdown(AD_DURATION)
    setAdProgress(0)
    setSessionEarnings(0)
    toast.info("Starting ad session...", { description: "Please don't close this page" })
  }

  const pauseWatching = () => {
    setIsWatching(false)
    toast.warning("Ad paused", { description: "Resume to continue earning" })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Main Ad Watching Card */}
      <Card className={cn(
        "border-2 transition-all duration-300",
        isWatching ? "border-red-500/50 bg-gradient-to-br from-red-500/5 to-transparent" : "border-border/50"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Heart className={cn(
                  "h-5 w-5 sm:h-6 sm:w-6 transition-colors",
                  isWatching ? "text-red-500 animate-pulse" : "text-muted-foreground"
                )} />
                Support Session
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Watch {ADS_PER_SESSION} ads to earn {ADS_PER_SESSION * REWARD_PER_AD} satoshis
              </CardDescription>
            </div>
            {isWatching && (
              <Badge className="bg-red-500 animate-pulse">Live</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ad Progress */}
          {isWatching && (
            <div className="space-y-4">
              {/* Current ad indicator */}
              <div className="flex items-center justify-center gap-2">
                {[...Array(ADS_PER_SESSION)].map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 w-2 rounded-full transition-all",
                      i < currentAdIndex ? "bg-green-500" :
                      i === currentAdIndex ? "bg-red-500 animate-pulse w-4" :
                      "bg-muted"
                    )}
                  />
                ))}
              </div>

              {/* Timer and progress */}
              <div className="text-center space-y-3">
                <div className="text-5xl sm:text-6xl font-bold font-mono">
                  {formatTime(countdown)}
                </div>
                <Progress value={adProgress} className="h-3" />
                <p className="text-sm text-muted-foreground">
                  Ad {currentAdIndex + 1} of {ADS_PER_SESSION}
                </p>
              </div>

              {/* Ad placeholder */}
              <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted rounded-xl border border-border/50 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Play className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Ad content playing...</p>
                  <p className="text-xs text-muted-foreground/70">Keep this page open</p>
                </div>
              </div>

              {/* Session earnings */}
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <Coins className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Session Earnings:</span>
                <span className="text-lg font-bold text-green-500">{sessionEarnings} sats</span>
              </div>
            </div>
          )}

          {/* Start/Pause Button */}
          <div className="flex justify-center">
            {isWatching ? (
              <Button 
                size="lg" 
                variant="outline"
                onClick={pauseWatching}
                className="gap-2 min-w-[200px]"
              >
                <Pause className="h-5 w-5" />
                Pause Session
              </Button>
            ) : (
              <Button 
                size="lg" 
                onClick={startWatching}
                className="gap-2 min-w-[200px] bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
              >
                <Play className="h-5 w-5" />
                Start Watching Ads
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Support Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-green-500">
              {totalEarnings.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lifetime earnings from supporting
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Ads Watched Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">
              {adsWatchedToday}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Keep going to earn more!
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Alert className="border-amber-500/30 bg-amber-500/5">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600 dark:text-amber-400">Pro Tip</AlertTitle>
        <AlertDescription className="text-xs sm:text-sm">
          You can watch ads while doing other activities. Just keep this tab open and let the ads run. 
          Make sure to disable any ad blockers to receive full credit for your support!
        </AlertDescription>
      </Alert>
    </div>
  )
}
