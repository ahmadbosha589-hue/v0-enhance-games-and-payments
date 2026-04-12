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
  TrendingUp, Sparkles, Volume2, VolumeX, X, RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import confetti from "canvas-confetti"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"

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

// $0.0003 per ad = approximately 3 satoshis
const REWARD_PER_AD_USD = 0.0003 // USD per ad
const REWARD_PER_AD = 3 // satoshis (approximate)
const AD_DURATION = 60 // seconds
const ADS_PER_SESSION = 3 // 3 ads running simultaneously

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

  // For continuous looping of all 11 ad networks
  const [adNetworkIndex, setAdNetworkIndex] = useState(0)
  const [loopCount, setLoopCount] = useState(0)

  const modalRef = useRef<HTMLDivElement>(null)

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

  // Run all ads simultaneously
  useEffect(() => {
    if (!isWatching || !hasStarted || allCompleted) return

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newTimes = prev.map(t => Math.max(0, t - 1))
        setAdProgress(newTimes.map(t => ((AD_DURATION - t) / AD_DURATION) * 100))
        setAdStatus(newTimes.map(t => t === 0 ? "completed" : "playing"))

        // Update session earnings in real-time
        const completedAds = newTimes.filter(t => t === 0).length
        setSessionEarnings(completedAds * REWARD_PER_AD)

        if (newTimes.every(t => t === 0)) {
          setAllCompleted(true)
        }
        return newTimes
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isWatching, hasStarted, allCompleted])

  // Rotate through ad networks every few seconds when watching
  useEffect(() => {
    if (!isWatching || !hasStarted) return

    const rotateInterval = setInterval(() => {
      setAdNetworkIndex(prev => {
        const next = (prev + 1) % AD_NETWORKS.length
        if (next === 0) {
          setLoopCount(c => c + 1)
        }
        return next
      })
    }, 5000) // Rotate every 5 seconds

    return () => clearInterval(rotateInterval)
  }, [isWatching, hasStarted])

  const startWatching = useCallback(() => {
    setIsWatching(true)
    setHasStarted(true)
    setAdStatus(Array(ADS_PER_SESSION).fill("playing"))
    setAdProgress(Array(ADS_PER_SESSION).fill(0))
    setTimeRemaining(Array(ADS_PER_SESSION).fill(AD_DURATION))
    setAllCompleted(false)
    setSessionEarnings(0)
    setAdNetworkIndex(0)
    setLoopCount(0)
    toast.info("Starting ad session...", { description: "All 3 ads playing simultaneously" })
  }, [])

  const handleClaimReward = async () => {
    if (!allCompleted || isClaiming) return
    setIsClaiming(true)

    const totalSessionEarnings = ADS_PER_SESSION * REWARD_PER_AD
    setLastSessionEarnings(totalSessionEarnings)

    try {
      const response = await fetch("/api/support-us/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adsWatched: ADS_PER_SESSION,
          totalEarnings: totalSessionEarnings
        })
      })

      const data = await response.json()

      if (response.ok) {
        setTotalEarnings(prev => prev + totalSessionEarnings)
        setAdsWatchedToday(prev => prev + ADS_PER_SESSION)

        toast.success(`Session complete! +${totalSessionEarnings} sats`, {
          description: "Watch ads again to double your reward!"
        })

        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })

        // Reset for next session
        setIsWatching(false)
        setHasStarted(false)
        setAllCompleted(false)
        setSessionEarnings(0)
        setAdStatus(Array(ADS_PER_SESSION).fill("pending"))
        setAdProgress(Array(ADS_PER_SESSION).fill(0))
        setTimeRemaining(Array(ADS_PER_SESSION).fill(AD_DURATION))

        // Show double reward option
        setShowDoubleReward(true)

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

  const handleClaimDoubleReward = async () => {
    if (isClaiming) return
    setIsClaiming(true)

    try {
      const response = await fetch("/api/support-us/double", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adsWatched: ADS_PER_SESSION,
          baseAmount: lastSessionEarnings
        })
      })

      const data = await response.json()

      if (response.ok) {
        const bonusAmount = data.bonusAmount || lastSessionEarnings
        setTotalEarnings(prev => prev + bonusAmount)
        toast.success(`Double reward claimed! +${bonusAmount} sats`)

        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 }
        })

        setShowDoubleReward(false)
        mutate()
      } else {
        toast.error(data.error || "Failed to claim double reward")
      }
    } catch (error) {
      console.error("Failed to claim double reward:", error)
      toast.error("Failed to claim double reward")
    } finally {
      setIsClaiming(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get current 3 ad networks to display
  const getCurrentAdNetworks = () => {
    const networks = []
    for (let i = 0; i < ADS_PER_SESSION; i++) {
      networks.push(AD_NETWORKS[(adNetworkIndex + i) % AD_NETWORKS.length])
    }
    return networks
  }

  // Fullscreen ad watching UI
  if (isWatching && hasStarted) {
    const currentNetworks = getCurrentAdNetworks()

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
                All {ADS_PER_SESSION} ads playing simultaneously | Loop #{loopCount + 1}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {AD_NETWORKS[adNetworkIndex].name}
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

        {/* 3 Ad Slots - Grid layout for simultaneous viewing */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => {
              const network = currentNetworks[i]
              return (
                <Card
                  key={i}
                  className={cn(
                    "relative overflow-hidden transition-all duration-300 flex flex-col",
                    adStatus[i] === "completed" && "border-green-500/50 bg-green-500/5",
                    adStatus[i] === "playing" && "border-red-500/50"
                  )}
                >
                  <CardHeader className="pb-2 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", network.color)} />
                        <Badge
                          variant={adStatus[i] === "completed" ? "default" : "secondary"}
                          className={cn(
                            adStatus[i] === "completed" && "bg-green-500",
                            adStatus[i] === "playing" && "bg-red-500 animate-pulse"
                          )}
                        >
                          Ad #{i + 1} - {network.name}
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
                      Reward: ${REWARD_PER_AD_USD} ({REWARD_PER_AD} sats)
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 flex items-center justify-center">
                    {/* Ad placeholder - in production, embed actual ad here */}
                    <div className="aspect-video w-full bg-gradient-to-br from-muted/50 to-muted rounded-lg border border-dashed flex items-center justify-center">
                      {adStatus[i] === "playing" ? (
                        <div className="text-center space-y-2">
                          <div className={cn("w-4 h-4 mx-auto rounded-full animate-pulse", network.color)} />
                          <Play className="h-10 w-10 mx-auto text-red-500 animate-pulse" />
                          <p className="text-sm text-muted-foreground">{network.name} ad playing...</p>
                          <p className="text-xs text-muted-foreground/70">
                            ${REWARD_PER_AD_USD} reward
                          </p>
                        </div>
                      ) : adStatus[i] === "completed" ? (
                        <div className="text-center space-y-2">
                          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
                          <p className="text-sm font-medium text-green-500">Completed!</p>
                          <p className="text-xs text-muted-foreground">+{REWARD_PER_AD} sats</p>
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
              )
            })}
          </div>

          {/* All 11 Ad Networks Display - Below main ads */}
          <div className="mt-6 border-t pt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                All 11 Partner Ad Networks (Looping)
              </p>
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Auto-rotating
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {AD_NETWORKS.map((network, idx) => (
                <div
                  key={network.id}
                  className={cn(
                    "p-3 rounded-lg border transition-all duration-300",
                    idx === adNetworkIndex && "border-primary bg-primary/5 scale-105 shadow-md",
                    idx !== adNetworkIndex && "border-muted bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("w-2 h-2 rounded-full", network.color)} />
                    <span className="text-xs font-medium truncate">{network.name}</span>
                  </div>
                  <div className="aspect-video bg-muted/50 rounded flex items-center justify-center">
                    {idx === adNetworkIndex ? (
                      <Play className="h-4 w-4 text-primary animate-pulse" />
                    ) : (
                      <div className={cn("w-3 h-3 rounded-full opacity-50", network.color)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional inline banner ads */}
          <div className="mt-6">
            <MultiNetworkAds position="content" layout="grid" priority="high" />
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
                <p className="text-lg font-bold text-green-500">{sessionEarnings} sats</p>
                <p className="text-[10px] text-muted-foreground">
                  ${(sessionEarnings / REWARD_PER_AD * REWARD_PER_AD_USD).toFixed(4)} USD
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
                  Claim {ADS_PER_SESSION * REWARD_PER_AD} Satoshis
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
                Watch {ADS_PER_SESSION} ads simultaneously to earn ${(ADS_PER_SESSION * REWARD_PER_AD_USD).toFixed(4)} (~{ADS_PER_SESSION * REWARD_PER_AD} sats)
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
              <span className="font-mono">${REWARD_PER_AD_USD} ({REWARD_PER_AD} sats)</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium text-green-500 mt-1">
              <span>3 ads total</span>
              <span className="font-mono">${(REWARD_PER_AD_USD * 3).toFixed(4)} ({REWARD_PER_AD * 3} sats)</span>
            </div>
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

      {/* 11 Ad Networks Info */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            11 Partner Ad Networks
          </CardTitle>
          <CardDescription className="text-xs">
            Our ads rotate through all 11 partner networks for maximum earnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {AD_NETWORKS.map((network) => (
              <div
                key={network.id}
                className="p-2 rounded-lg bg-muted/30 border text-center"
              >
                <div className={cn("w-2 h-2 rounded-full mx-auto mb-1", network.color)} />
                <span className="text-[10px] text-muted-foreground">{network.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Alert className="border-amber-500/30 bg-amber-500/5">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600 dark:text-amber-400">Pro Tip</AlertTitle>
        <AlertDescription className="text-xs sm:text-sm">
          All 3 ads run simultaneously, so you only wait 60 seconds total! After claiming, you can
          watch more ads to double your reward. Keep this tab open and let the ads run through all 11 networks.
        </AlertDescription>
      </Alert>

      {/* Double Reward Modal */}
      {showDoubleReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Double Your Reward!
              </CardTitle>
              <CardDescription>
                Watch another ad session to double your earnings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 text-center">
                <p className="text-sm text-muted-foreground mb-1">You earned</p>
                <p className="text-3xl font-bold text-green-500">{lastSessionEarnings} sats</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Claim double to get +{lastSessionEarnings} more!
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDoubleReward(false)}
                >
                  Skip
                </Button>
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  onClick={handleClaimDoubleReward}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Coins className="h-4 w-4" />
                      Double Reward
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
