"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Play, Pause, Heart, Coins, Clock, CheckCircle2,
  TrendingUp, Sparkles, Volume2, VolumeX, X, RefreshCw, AlertTriangle,
  ArrowDown, Rocket, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import confetti from "canvas-confetti"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { AdSlotMultiNetwork } from "@/components/ads/ad-slot-multi-network"
import { CxUaBanner } from "@/components/ads/cx-ua-ads"

const SUPPORT_REWARDED_ADS_ENABLED = false

interface SupportUsContentProps {
  userId: string
}

// 11 Ad Networks (same as multi-network-ads.tsx)
const AD_NETWORKS = [
  { id: "a-ads", name: "A-ADS", color: "bg-blue-500" },
  { id: "coinzilla", name: "CoinZilla", color: "bg-amber-500" },
  { id: "bitmedia", name: "BitMedia", color: "bg-orange-500" },
  { id: "cointraffic", name: "CoinTraffic", color: "bg-green-500" },
  { id: "medianet", name: "Media.net", color: "bg-purple-500" },
  { id: "hilltopads", name: "HilltopAds", color: "bg-red-500" },
  { id: "adsterra", name: "Adsterra", color: "bg-cyan-500" },
  { id: "propellerads", name: "PropellerAds", color: "bg-pink-500" },
  { id: "trafficstars", name: "TrafficStars", color: "bg-indigo-500" },
  { id: "mellowads", name: "MellowAds", color: "bg-teal-500" },
  { id: "adskeeper", name: "AdsKeeper", color: "bg-emerald-500" },
] as const

// $0.0001 per ad — 3 ads = $0.0003 base USDT sent to FaucetPay.
// After claim, the user can scroll to the 11-network section and watch
// them to triple their reward (bonus of $0.0006 → total $0.0009 USDT).
const REWARD_PER_AD_USD = 0.0001 // USD per ad
const TOTAL_REWARD_USDT = 0.0003 // Base session total
const TRIPLE_BONUS_USDT = 0.0006 // Bonus sent on "triple" claim
const TRIPLED_TOTAL_USDT = 0.0009 // Final total after triple
const AD_DURATION = 60 // seconds
const ADS_PER_SESSION = 3 // 3 ads running simultaneously
const PARTNER_AD_WATCH_SECONDS = 30 // seconds the user must keep partner section visible

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function SupportUsContent({ userId }: SupportUsContentProps) {
  // States for simultaneous ad watching
  const [isWatching, setIsWatching] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [adProgress, setAdProgress] = useState<number[]>(Array(ADS_PER_SESSION).fill(0))
  const [adStatus, setAdStatus] = useState<("pending" | "playing" | "completed")[]>(Array(ADS_PER_SESSION).fill("pending"))
  const [timeRemaining, setTimeRemaining] = useState<number[]>(Array(ADS_PER_SESSION).fill(AD_DURATION))
  const [allCompleted, setAllCompleted] = useState(false)
  const [sessionEarnings, setSessionEarnings] = useState(0)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [adsWatchedToday, setAdsWatchedToday] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [showDoubleReward, setShowDoubleReward] = useState(false)
  const [lastSessionEarnings, setLastSessionEarnings] = useState(0)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Triple-reward flow state (replaces "double" modal)
  const [hasClaimedBase, setHasClaimedBase] = useState(false)
  const [tripleClaimed, setTripleClaimed] = useState(false)
  const [partnerWatchProgress, setPartnerWatchProgress] = useState(0) // 0..100
  const [partnerWatchUnlocked, setPartnerWatchUnlocked] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)
  const partnerSectionRef = useRef<HTMLDivElement>(null)
  const partnerWatchSecondsRef = useRef<number>(0)

  // Fetch user's support stats
  const { data: statsData, mutate } = useSWR(
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

  // Prevent scrolling when watching
  useEffect(() => {
    if (isWatching && hasStarted) {
      document.body.style.overflow = "hidden"
      document.body.style.position = "fixed"
      document.body.style.width = "100%"
      document.body.style.top = `-${window.scrollY}px`
    } else {
      const scrollY = document.body.style.top
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
      document.body.style.top = ""
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY) * -1)
      }
    }

    return () => {
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
      document.body.style.top = ""
    }
  }, [isWatching, hasStarted])

  // Track partner-network watch progress AFTER the base reward is claimed.
  // Uses IntersectionObserver + tab visibility so we only count seconds while
  // the section is on screen and the page is focused. Once PARTNER_AD_WATCH_SECONDS
  // is reached we unlock the "Triple Reward" CTA.
  useEffect(() => {
    if (!hasClaimedBase || tripleClaimed || partnerWatchUnlocked) return

    const el = partnerSectionRef.current
    if (!el) return

    let intersecting = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting && entry.intersectionRatio > 0.25
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    observer.observe(el)

    const interval = setInterval(() => {
      if (!intersecting) return
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return

      partnerWatchSecondsRef.current = Math.min(
        partnerWatchSecondsRef.current + 1,
        PARTNER_AD_WATCH_SECONDS
      )
      const pct = Math.round(
        (partnerWatchSecondsRef.current / PARTNER_AD_WATCH_SECONDS) * 100
      )
      setPartnerWatchProgress(pct)

      if (partnerWatchSecondsRef.current >= PARTNER_AD_WATCH_SECONDS) {
        setPartnerWatchUnlocked(true)
        toast.success("Triple Reward unlocked!", {
          description: "Click the button below to claim your $0.0006 bonus."
        })
      }
    }, 1000)

    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [hasClaimedBase, tripleClaimed, partnerWatchUnlocked])

  // Page visibility detection - pause when user leaves the page
  useEffect(() => {
    if (!isWatching || !hasStarted || allCompleted) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setIsPaused(true)
        toast.warning("Ads paused! Return to continue watching.", {
          description: "Timer paused because you left the page",
          duration: 5000
        })
      } else if (document.visibilityState === "visible" && isPaused) {
        // User returned - show resume option
        toast.info("Welcome back! Click resume to continue.", {
          description: "Your progress is saved"
        })
      }
    }

    const handleBlur = () => {
      if (isWatching && hasStarted && !allCompleted) {
        setIsPaused(true)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleBlur)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleBlur)
    }
  }, [isWatching, hasStarted, allCompleted, isPaused])

  // Run all ads simultaneously
  useEffect(() => {
    if (!isWatching || !hasStarted || allCompleted || isPaused) return

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newTimes = prev.map(t => Math.max(0, t - 1))
        setAdProgress(newTimes.map(t => ((AD_DURATION - t) / AD_DURATION) * 100))
        setAdStatus(newTimes.map(t => t === 0 ? "completed" : "playing"))

        // Update session earnings in real-time (in USDT)
        const completedAds = newTimes.filter(t => t === 0).length
        setSessionEarnings(completedAds * REWARD_PER_AD_USD)

        if (newTimes.every(t => t === 0)) {
          setAllCompleted(true)
        }
        return newTimes
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isWatching, hasStarted, allCompleted, isPaused])

  const startWatching = useCallback(() => {
    setIsWatching(true)
    setHasStarted(true)
    setIsPaused(false)
    setAdStatus(Array(ADS_PER_SESSION).fill("playing"))
    setAdProgress(Array(ADS_PER_SESSION).fill(0))
    setTimeRemaining(Array(ADS_PER_SESSION).fill(AD_DURATION))
    setAllCompleted(false)
    setSessionEarnings(0)
    toast.info("Starting ad session...", { description: "3 Google Rewarded Ads playing simultaneously" })
  }, [])

  const resumeWatching = useCallback(() => {
    setIsPaused(false)
    toast.success("Timer resumed!", { description: "Keep watching to earn your reward" })
  }, [])

  const handleClaimReward = async () => {
    if (!allCompleted || isClaiming) return
    setIsClaiming(true)

    try {
      const response = await fetch("/api/support-us/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adsWatched: ADS_PER_SESSION
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setAdsWatchedToday(prev => prev + ADS_PER_SESSION)
        setLastSessionEarnings(TOTAL_REWARD_USDT)

        toast.success(`$${TOTAL_REWARD_USDT} USDT sent to FaucetPay!`, {
          description: "Scroll down to TRIPLE your reward to $0.0009 USDT",
          duration: 6000
        })

        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })

        // Reset ad session UI
        setIsWatching(false)
        setHasStarted(false)
        setAllCompleted(false)
        setSessionEarnings(0)
        setAdStatus(Array(ADS_PER_SESSION).fill("pending"))
        setAdProgress(Array(ADS_PER_SESSION).fill(0))
        setTimeRemaining(Array(ADS_PER_SESSION).fill(AD_DURATION))

        // Unlock the triple-reward flow and auto-scroll to the partner section
        setHasClaimedBase(true)
        setTripleClaimed(false)
        setPartnerWatchUnlocked(false)
        setPartnerWatchProgress(0)
        partnerWatchSecondsRef.current = 0

        // Smoothly scroll to the partner-network section so the user knows to watch
        setTimeout(() => {
          partnerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 600)

        mutate()
      } else {
        toast.error(data.error || "Failed to claim rewards")
      }
    } catch (error) {
      console.error("Failed to record support earnings:", error)
      toast.error("Failed to claim rewards")
    } finally {
      setIsClaiming(false)
    }
  }

  const handleClaimTripleReward = async () => {
    if (isClaiming || !partnerWatchUnlocked || tripleClaimed) return
    setIsClaiming(true)

    try {
      const response = await fetch("/api/support-us/double", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adsWatched: ADS_PER_SESSION
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`+$${TRIPLE_BONUS_USDT} USDT bonus sent — total this session: $${TRIPLED_TOTAL_USDT}!`, {
          description: data.message || "Check your FaucetPay account",
          duration: 6000
        })

        confetti({
          particleCount: 180,
          spread: 110,
          origin: { y: 0.5 }
        })

        setTripleClaimed(true)
        setShowDoubleReward(false)
        // Reset the partner-watch tracker so it can run again next session
        setHasClaimedBase(false)
        setPartnerWatchProgress(0)
        partnerWatchSecondsRef.current = 0
        mutate()
      } else {
        toast.error(data.error || "Failed to claim triple reward")
      }
    } catch (error) {
      console.error("Failed to claim triple reward:", error)
      toast.error("Failed to claim triple reward")
    } finally {
      setIsClaiming(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!SUPPORT_REWARDED_ADS_ENABLED) {
    return (
      <Card className="border-muted bg-muted/20">
        <CardHeader>
          <CardTitle>Support rewards unavailable</CardTitle>
          <CardDescription>
            Verified rewarded-ad sessions are not enabled for this deployment. No watch-based payout will be issued.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Fullscreen ad watching UI
  if (isWatching && hasStarted) {
    return (
      <div
        ref={modalRef}
        className="fixed inset-0 z-50 bg-background flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 text-red-500 animate-pulse" />
            <div>
              <h2 className="font-bold text-lg">Supporting CryptoFaucet</h2>
              <p className="text-xs text-muted-foreground">
                3 Google Rewarded Ads running simultaneously
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/30">
              Google Rewarded
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              className="h-8 w-8"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            {allCompleted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsWatching(false)
                  setHasStarted(false)
                }}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Paused Overlay */}
        {isPaused && !allCompleted && (
          <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
            <Card className="max-w-md mx-4 border-2 border-yellow-500/50 bg-yellow-500/5">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                </div>
                <CardTitle className="text-xl text-yellow-600">Ads Paused</CardTitle>
                <CardDescription>
                  You left the page! Return here and click resume to continue watching.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Time remaining</p>
                  <p className="text-2xl font-bold font-mono">
                    {formatTime(Math.max(...timeRemaining))}
                  </p>
                </div>
                <Button
                  onClick={resumeWatching}
                  className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                  size="lg"
                >
                  <Play className="h-5 w-5" />
                  Resume Watching
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Your progress is saved. Stay on this page to earn your reward.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 3 Google Rewarded Ad Slots - Running Simultaneously */}
        <div className={cn("flex-1 p-4 overflow-auto", isPaused && "opacity-50 pointer-events-none")}>
          <div className="mb-4">
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <Play className="h-4 w-4 text-red-500" />
              3 Google Rewarded Ads (60 Seconds Each)
              {isPaused && <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">PAUSED</Badge>}
            </h3>
            <p className="text-xs text-muted-foreground">All 3 ads run simultaneously - watch all to claim reward</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Card
                key={i}
                className={cn(
                  "relative overflow-hidden transition-all duration-300 flex flex-col",
                  adStatus[i] === "completed" && "border-green-500/50 bg-green-500/5",
                  adStatus[i] === "playing" && "border-red-500/50 shadow-lg"
                )}
              >
                <CardHeader className="pb-2 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <Badge
                        variant={adStatus[i] === "completed" ? "default" : "secondary"}
                        className={cn(
                          adStatus[i] === "completed" && "bg-green-500",
                          adStatus[i] === "playing" && "bg-red-500 text-white animate-pulse"
                        )}
                      >
                        Google Ad #{i + 1}
                      </Badge>
                    </div>
                    {adStatus[i] === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <Clock className="h-4 w-4 animate-pulse" />
                        <span className="text-sm font-mono font-bold">{formatTime(timeRemaining[i])}</span>
                      </div>
                    )}
                  </div>
                  <Progress value={adProgress[i]} className="h-2 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Reward: ${REWARD_PER_AD_USD} USDT
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center">
                  <div className="aspect-video w-full bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-lg border border-red-500/20 flex items-center justify-center">
                    {adStatus[i] === "playing" ? (
                      <div className="text-center space-y-2">
                        <div className="relative">
                          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                            <Play className="h-6 w-6 text-red-500" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                        </div>
                        <p className="text-sm font-medium">Google Rewarded Ad</p>
                        <p className="text-xs text-muted-foreground">60 Second Video</p>
                      </div>
                    ) : adStatus[i] === "completed" ? (
                      <div className="text-center space-y-2">
                        <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
                        <p className="text-sm font-medium text-green-500">Completed!</p>
                        <p className="text-xs text-muted-foreground">+${REWARD_PER_AD_USD} USDT</p>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <Play className="h-10 w-10 mx-auto text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Waiting...</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All 11 Partner Ad Networks - Real Ad Slots */}
          <div className="mt-6 p-4 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-base font-semibold flex items-center gap-2">
                    11 Partner Ad Networks
                    <Badge className="bg-green-500 text-white text-[10px] animate-pulse">LIVE</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">Real ads generating impressions</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                Generating Revenue
              </Badge>
            </div>

            {/* Real Ad Slots Grid - 2 rows of ads for better visibility */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {AD_NETWORKS.map((network, index) => (
                <div key={network.id} className="flex flex-col gap-1.5 p-2 rounded-lg border bg-background/50">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", network.color)} />
                    <span className="text-[10px] font-medium truncate">{network.name}</span>
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  </div>
                  <AdSlotMultiNetwork
                    position="content"
                    size="rectangle"
                    className="w-full"
                    priority={index < 4 ? "high" : index < 8 ? "medium" : "low"}
                    lazyLoad={index >= 6}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-lg py-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              <span>All 11 ad networks actively generating real impressions</span>
            </div>
          </div>
        </div>

        {/* Footer with claim button */}
        <div className="p-4 border-t bg-background/95 backdrop-blur">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Session earnings */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <Coins className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Session Earnings</p>
                <p className="text-lg font-bold text-green-500">${sessionEarnings.toFixed(4)} USDT</p>
                <p className="text-[10px] text-muted-foreground">
                  Sent to FaucetPay
                </p>
              </div>
            </div>

            {/* Claim button */}
            <Button
              size="lg"
              onClick={handleClaimReward}
              disabled={!allCompleted || isClaiming}
              className={cn(
                "gap-2 min-w-[200px]",
                allCompleted
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                  : ""
              )}
            >
              {isClaiming ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Claiming...
                </>
              ) : allCompleted ? (
                <>
                  <Coins className="h-5 w-5" />
                  Claim ${TOTAL_REWARD_USDT} USDT
                </>
              ) : (
                <>
                  <Clock className="h-5 w-5 animate-pulse" />
                  {adStatus.filter(s => s === "completed").length}/{ADS_PER_SESSION} Completed
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Ad Watching Card */}
      <Card className="border-2 border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-red-500" />
                Support Session
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Watch {ADS_PER_SESSION} ads simultaneously to earn ${TOTAL_REWARD_USDT} USDT (sent to FaucetPay)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* How it works */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/50">
              <Play className="h-6 w-6 mx-auto text-red-500 mb-1" />
              <p className="text-xs font-medium">3 Ads</p>
              <p className="text-[10px] text-muted-foreground">Simultaneously</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <Clock className="h-6 w-6 mx-auto text-blue-500 mb-1" />
              <p className="text-xs font-medium">60 Seconds</p>
              <p className="text-[10px] text-muted-foreground">Per ad</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <Coins className="h-6 w-6 mx-auto text-green-500 mb-1" />
              <p className="text-xs font-medium">${(REWARD_PER_AD_USD * ADS_PER_SESSION).toFixed(4)}</p>
              <p className="text-[10px] text-muted-foreground">Per session</p>
            </div>
          </div>

          {/* Reward breakdown */}
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground mb-2">Reward Breakdown:</p>
            <div className="flex items-center justify-between text-sm">
              <span>Each ad</span>
              <span className="font-mono">${REWARD_PER_AD_USD} USDT</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium text-green-500 mt-1">
              <span>3 ads total</span>
              <span className="font-mono">${TOTAL_REWARD_USDT} USDT</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Sent directly to your FaucetPay account</p>
          </div>

          {/* Start Button */}
          <Button
            size="lg"
            onClick={startWatching}
            className="w-full gap-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
          >
            <Play className="h-5 w-5" />
            Start Watching Ads
          </Button>
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

      {/* Post-claim scroll prompt */}
      {hasClaimedBase && !tripleClaimed && (
        <Alert className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 animate-in fade-in slide-in-from-top-2">
          <Rocket className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <span>Triple Your Reward — Scroll Down</span>
            <ArrowDown className="h-4 w-4 animate-bounce" />
          </AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">
            You just claimed <strong>${TOTAL_REWARD_USDT} USDT</strong>. Keep the 11 Partner Ad Networks
            section below in view for {PARTNER_AD_WATCH_SECONDS}s to unlock an extra{" "}
            <strong>${TRIPLE_BONUS_USDT} USDT</strong> bonus — a total of{" "}
            <strong>${TRIPLED_TOTAL_USDT} USDT</strong> for this session.
          </AlertDescription>
        </Alert>
      )}

      {/* 11 Ad Networks — Triple Reward zone */}
      <Card
        ref={partnerSectionRef}
        className={cn(
          "transition-all duration-500",
          hasClaimedBase && !tripleClaimed
            ? "border-2 border-amber-500/50 shadow-[0_0_30px_-12px_rgba(245,158,11,0.4)]"
            : "border-muted"
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className={cn(
                  "h-5 w-5",
                  hasClaimedBase && !tripleClaimed ? "text-amber-500" : "text-primary"
                )} />
                11 Partner Ad Networks
                {hasClaimedBase && !tripleClaimed && (
                  <Badge className="bg-amber-500 text-white text-[10px] gap-1">
                    <Zap className="h-2.5 w-2.5" />
                    Triple Reward Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {hasClaimedBase && !tripleClaimed
                  ? `Keep this section visible to unlock +$${TRIPLE_BONUS_USDT} USDT bonus`
                  : "All 11 partner networks displaying — you earn impressions while browsing"}
              </CardDescription>
            </div>

            {hasClaimedBase && !tripleClaimed && (
              <div className="flex flex-col items-end gap-1 min-w-[140px]">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {partnerWatchUnlocked ? "Unlocked" : "Watching"}
                </span>
                <Progress
                  value={partnerWatchProgress}
                  className={cn(
                    "h-2 w-32 sm:w-40",
                    partnerWatchUnlocked && "[&>div]:bg-green-500"
                  )}
                />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {Math.min(
                    PARTNER_AD_WATCH_SECONDS,
                    Math.round((partnerWatchProgress / 100) * PARTNER_AD_WATCH_SECONDS)
                  )}s / {PARTNER_AD_WATCH_SECONDS}s
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Triple Reward CTA — only shown after base claim */}
          {hasClaimedBase && !tripleClaimed && (
            <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/30">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-amber-500" />
                    {partnerWatchUnlocked ? "Bonus ready to claim!" : "Triple Reward Unlocking..."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Base ${TOTAL_REWARD_USDT} already sent · Bonus{" "}
                    <span className="text-amber-500 font-semibold">+${TRIPLE_BONUS_USDT}</span> ·
                    Total <span className="text-green-500 font-semibold">${TRIPLED_TOTAL_USDT}</span>
                  </p>
                </div>
                <Button
                  onClick={handleClaimTripleReward}
                  disabled={!partnerWatchUnlocked || isClaiming}
                  className={cn(
                    "gap-2 shrink-0",
                    partnerWatchUnlocked
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 animate-pulse"
                      : ""
                  )}
                >
                  {isClaiming ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : partnerWatchUnlocked ? (
                    <>
                      <Coins className="h-4 w-4" />
                      Claim +${TRIPLE_BONUS_USDT} Bonus
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4" />
                      {Math.max(
                        0,
                        PARTNER_AD_WATCH_SECONDS -
                          Math.round((partnerWatchProgress / 100) * PARTNER_AD_WATCH_SECONDS)
                      )}s to unlock
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Actual MultiNetworkAds component with real ad scripts */}
          <MultiNetworkAds
            position="content"
            layout="grid"
            showLabels={true}
            lazyLoad={false}
            priority="high"
          />

          {/* CX.UA banner — sits neatly between the 11 networks and the legend */}
          <CxUaBanner variant="compact" className="mt-2" />

          {/* Network legend */}
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Networks currently displaying:</p>
            <div className="flex flex-wrap gap-1.5">
              {AD_NETWORKS.map((network) => (
                <Badge
                  key={network.id}
                  variant="outline"
                  className="text-[10px] gap-1"
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", network.color)} />
                  {network.name}
                </Badge>
              ))}
              {/* CX.UA listed alongside as a 12th partner */}
              <Badge variant="outline" className="text-[10px] gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                CX.UA
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Alert className="border-amber-500/30 bg-amber-500/5">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600 dark:text-amber-400">Pro Tip</AlertTitle>
        <AlertDescription className="text-xs sm:text-sm">
          All 3 ads run simultaneously, so you only wait 60 seconds total. After claiming the base{" "}
          ${TOTAL_REWARD_USDT}, scroll to the 11 Partner Networks section and keep it visible for{" "}
          {PARTNER_AD_WATCH_SECONDS} seconds to TRIPLE your reward to ${TRIPLED_TOTAL_USDT} USDT.
        </AlertDescription>
      </Alert>
    </div>
  )
}
