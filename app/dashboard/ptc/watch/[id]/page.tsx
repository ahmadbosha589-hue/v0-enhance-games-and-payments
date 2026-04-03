"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Play,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Coins,
  Clock,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { AdSlotMultiNetwork } from "@/components/ads/ad-slot-multi-network"
import { GoogleRewardedAds } from "@/components/ads/google-rewarded-ads"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { WatchAdBonusReward } from "@/components/ads/watch-ad-bonus-reward"
import { useLanguage } from "@/lib/i18n/language-context"

interface PTCAd {
  id: string
  title: string
  description: string
  url: string
  duration_seconds: number
  reward_satoshis: number
}

export default function PTCWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useLanguage()

  const [ad, setAd] = useState<PTCAd | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState<"loading" | "ready" | "watching" | "paused" | "claiming" | "completed">("loading")
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const adWindowRef = useRef<Window | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Fetch ad details
  useEffect(() => {
    async function fetchAd() {
      try {
        const res = await fetch(`/api/ptc/${id}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to load ad")
        }
        const data = await res.json()
        setAd(data.ad)
        setTimeLeft(data.ad.duration_seconds)
        setStatus("ready")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load ad")
      } finally {
        setIsLoading(false)
      }
    }
    fetchAd()
  }, [id])

  // Visibility and focus handling for timer
  useEffect(() => {
    if (status !== "watching" && status !== "paused") return

    const checkAdWindow = () => {
      if (adWindowRef.current?.closed && !isPaused && status === "watching") {
        setIsPaused(true)
        setStatus("paused")
        toast.warning("Ad window closed! Reopen to continue.")
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (status === "watching" && !isPaused && !adWindowRef.current?.closed) {
          setIsPaused(true)
          setStatus("paused")
          toast.warning("Timer paused! Return to the ad page.")
        }
      } else if (document.visibilityState === "hidden") {
        if (status === "paused" && isPaused && !adWindowRef.current?.closed) {
          setIsPaused(false)
          setStatus("watching")
        }
      }
    }

    const windowCheckInterval = setInterval(checkAdWindow, 1000)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(windowCheckInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [status, isPaused])

  // Timer logic
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (status === "watching" && !isPaused && timeLeft > 0 && ad) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const newTime = prev - 1
          setProgress(((ad.duration_seconds - newTime) / ad.duration_seconds) * 100)

          if (newTime <= 0) {
            setStatus("claiming")
            handleClaimReward()
            return 0
          }
          return newTime
        })
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [status, isPaused, timeLeft, ad])

  const handleStartWatching = useCallback(() => {
    if (!ad) return
    adWindowRef.current = window.open(ad.url, "_blank", "noopener,noreferrer")
    setStatus("watching")
    setTimeLeft(ad.duration_seconds)
    setProgress(0)
    setIsPaused(false)
    toast.info("Stay on the ad page! Timer runs while viewing.")
  }, [ad])

  const handleResumeWatching = useCallback(() => {
    if (!ad) return
    if (adWindowRef.current && !adWindowRef.current.closed) {
      adWindowRef.current.focus()
    } else {
      adWindowRef.current = window.open(ad.url, "_blank", "noopener,noreferrer")
    }
    setIsPaused(false)
    setStatus("watching")
    toast.info("Timer resumed!")
  }, [ad])

  const handleClaimReward = useCallback(async () => {
    if (!ad) return

    try {
      const response = await fetch("/api/ptc/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adId: ad.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim reward")
      }

      setStatus("completed")
      toast.success(`Earned ${data.reward} satoshis!`)

      // Close ad window
      if (adWindowRef.current && !adWindowRef.current.closed) {
        adWindowRef.current.close()
      }

      // Broadcast PTC completion so manual faucet auto-unlocks
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("ptc_completed")
          bc.postMessage({ type: "ptc_completed", adId: ad.id, timestamp: Date.now() })
          bc.close()
        }
      } catch { }

      // Clear cache
      try {
        sessionStorage.removeItem("mf_ptc_count_v1")
        sessionStorage.removeItem("mf_cache_time_v1")
      } catch { }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim")
      setStatus("ready")
    }
  }, [ad])

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-primary/20">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Loading ad...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !ad) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || "Ad not found"}</AlertDescription>
          </Alert>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/dashboard/ptc">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to PTC Ads
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2">
              <Link href="/dashboard/ptc">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to PTC Ads
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">{ad.title}</h1>
            <p className="text-muted-foreground">{ad.description}</p>
          </div>
          <Badge variant="outline" className="gap-2 text-lg py-2 px-4">
            <Coins className="h-5 w-5 text-amber-500" />
            {ad.reward_satoshis} sats
          </Badge>
        </div>

        {/* Top Ad Row - 3 ads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar Ads */}
          <div className="hidden lg:flex lg:col-span-2 flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" className="mx-auto" />
          </div>

          {/* Main Watch Card */}
          <div className="lg:col-span-8">
            <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Sparkles className="h-6 w-6 text-amber-500" />
                  Watch & Earn
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {/* Status Display */}
                {status === "ready" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                      <Play className="h-12 w-12 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-medium">Ready to Watch</p>
                      <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                        <Clock className="h-4 w-4" />
                        {ad.duration_seconds} seconds viewing time
                      </p>
                    </div>
                    <Button onClick={handleStartWatching} size="lg" className="gap-2">
                      <Play className="h-5 w-5" />
                      Start Watching
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {status === "watching" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                      <Clock className="h-12 w-12 text-green-500" />
                    </div>
                    <Progress value={progress} className="h-3 [&>div]:bg-green-500" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-500 font-medium animate-pulse">Timer running...</span>
                      <span className="font-bold text-2xl">{timeLeft}s</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stay on the ad page! Timer pauses if you return here.
                    </p>
                  </div>
                )}

                {status === "paused" && (
                  <div className="text-center space-y-4">
                    <Alert className="border-yellow-500/50 bg-yellow-500/10">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                        Timer paused! Return to the ad page to continue.
                      </AlertDescription>
                    </Alert>
                    <Progress value={progress} className="h-3" />
                    <p className="font-bold text-xl">{timeLeft}s remaining</p>
                    <Button onClick={handleResumeWatching} variant="outline" className="gap-2 border-yellow-500/50">
                      <ArrowLeft className="h-4 w-4" />
                      Return to Ad Page
                    </Button>
                  </div>
                )}

                {status === "claiming" && (
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                    <p className="text-lg font-medium">Claiming your reward...</p>
                  </div>
                )}

                {status === "completed" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-500">+{ad.reward_satoshis} sats</p>
                      <p className="text-muted-foreground">Reward claimed successfully!</p>
                    </div>

                    {/* Watch Ad to Double PTC Reward */}
                    <div className="pt-4 pb-2 border-t border-dashed">
                      <WatchAdBonusReward
                        type="faucet_double"
                        baseAmount={ad.reward_satoshis}
                        multiplier={2}
                        isVisible={true}
                        className="w-full sm:w-auto"
                      />
                    </div>

                    <Button asChild className="gap-2" variant="outline">
                      <Link href="/dashboard/ptc">
                        <ArrowLeft className="h-4 w-4" />
                        Watch More Ads
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bottom content ads */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
              <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
            </div>
          </div>

          {/* Right Sidebar Ads */}
          <div className="hidden lg:flex lg:col-span-2 flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" className="mx-auto" />
          </div>
        </div>

        {/* Bottom Ad Row - 3 ads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
        </div>

        {/* Spacer to separate Google Ads from other networks per policy */}
        <div className="h-8" aria-hidden="true" />

        {/* Google Rewarded Ads - 3x 60s static ads (MUST be separate from other networks) */}
        <GoogleRewardedAds position="bottom" className="mt-4" />

        {/* Another spacer */}
        <div className="h-8" aria-hidden="true" />

        {/* Other 11 Ad Networks - auto-refreshing (except AdsKeeper which only refreshes on page load) */}
        <MultiNetworkAds position="footer" layout="grid" showLabels={false} />

        {/* Full width leaderboard */}
        <AdSlotMultiNetwork position="footer" size="leaderboard" className="mx-auto mt-6" />
      </div>
    </div>
  )
}
