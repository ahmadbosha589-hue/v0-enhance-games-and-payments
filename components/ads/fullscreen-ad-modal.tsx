"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Play, Clock, CheckCircle, Coins, Loader2, Sparkles, Gift, Zap, X, Volume2, VolumeX, Trophy } from "lucide-react"
import { toast } from "sonner"
import confetti from "canvas-confetti"
import { cn } from "@/lib/utils"

export type DoubleRewardType =
  | "faucet"
  | "faucet_claim"
  | "manual_faucet"
  | "daily_bonus"
  | "shortlink"
  | "coupon"
  | "ptc_milestone"
  | "game"

interface FullscreenAdModalProps {
  isOpen: boolean
  onClose: () => void
  type: DoubleRewardType
  baseAmount: number
  multiplier?: number
  cryptoSymbol?: string
  onComplete?: (bonusAmount: number) => void
  apiEndpoint?: string
}

const TYPE_CONFIG: Record<DoubleRewardType, {
  title: string
  description: string
  icon: typeof Gift
  gradient: string
  borderColor: string
  bgGradient: string
}> = {
  faucet: {
    title: "Double Your Faucet Reward",
    description: "Watch all 3 Google rewarded ads to receive 2x your faucet claim",
    icon: Coins,
    gradient: "from-green-500 to-emerald-500",
    borderColor: "border-green-500/50",
    bgGradient: "from-green-500/10 via-emerald-500/5 to-transparent"
  },
  faucet_claim: {
    title: "Double Your Faucet Reward",
    description: "Watch all 3 Google rewarded ads to receive 2x your faucet claim",
    icon: Coins,
    gradient: "from-green-500 to-emerald-500",
    borderColor: "border-green-500/50",
    bgGradient: "from-green-500/10 via-emerald-500/5 to-transparent"
  },
  manual_faucet: {
    title: "Double Your Manual Faucet Reward",
    description: "Watch all 3 Google rewarded ads to receive 2x your claim",
    icon: Coins,
    gradient: "from-amber-500 to-yellow-500",
    borderColor: "border-amber-500/50",
    bgGradient: "from-amber-500/10 via-yellow-500/5 to-transparent"
  },
  daily_bonus: {
    title: "Double Your Daily Bonus",
    description: "Watch all 3 Google rewarded ads to receive 2x your daily bonus",
    icon: Gift,
    gradient: "from-purple-500 to-pink-500",
    borderColor: "border-purple-500/50",
    bgGradient: "from-purple-500/10 via-pink-500/5 to-transparent"
  },
  shortlink: {
    title: "Double Your Shortlink Reward",
    description: "Watch all 3 Google rewarded ads to receive 2x your shortlink earnings",
    icon: Sparkles,
    gradient: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/50",
    bgGradient: "from-blue-500/10 via-cyan-500/5 to-transparent"
  },
  coupon: {
    title: "Double Your Coupon Reward",
    description: "Watch all 3 Google rewarded ads to receive 2x your coupon earnings",
    icon: Gift,
    gradient: "from-pink-500 to-rose-500",
    borderColor: "border-pink-500/50",
    bgGradient: "from-pink-500/10 via-rose-500/5 to-transparent"
  },
  ptc_milestone: {
    title: "Claim Your 5x PTC Milestone Bonus",
    description: "You&apos;ve watched 5 PTC ads! Watch 3 rewarded ads for milestone bonus",
    icon: Zap,
    gradient: "from-orange-500 to-red-500",
    borderColor: "border-orange-500/50",
    bgGradient: "from-orange-500/10 via-red-500/5 to-transparent"
  },
  game: {
    title: "Double Your Game Winnings",
    description: "Watch all 3 Google rewarded ads to receive 2x your game reward",
    icon: Sparkles,
    gradient: "from-indigo-500 to-violet-500",
    borderColor: "border-indigo-500/50",
    bgGradient: "from-indigo-500/10 via-violet-500/5 to-transparent"
  }
}

// 11 Partner Ad Networks
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

const AD_COUNT = 3
const AD_DURATION = 60 // seconds per ad - all 3 run simultaneously

export function FullscreenAdModal({
  isOpen,
  onClose,
  type,
  baseAmount,
  multiplier = 2,
  cryptoSymbol,
  onComplete,
  apiEndpoint = "/api/bonus-reward/claim"
}: FullscreenAdModalProps) {
  const [adProgress, setAdProgress] = useState<number[]>(Array(AD_COUNT).fill(0))
  const [adStatus, setAdStatus] = useState<("pending" | "playing" | "completed")[]>(Array(AD_COUNT).fill("pending"))
  const [timeRemaining, setTimeRemaining] = useState<number[]>(Array(AD_COUNT).fill(AD_DURATION))
  const [allCompleted, setAllCompleted] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  const config = TYPE_CONFIG[type]
  const bonusAmount = Math.floor(baseAmount * (multiplier - 1))
  const totalAmount = Math.floor(baseAmount * multiplier)
  const Icon = config.icon

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
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
      window.scrollTo(0, parseInt(scrollY || "0") * -1)
    }

    return () => {
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
      document.body.style.top = ""
    }
  }, [isOpen])

  // Prevent escape key and back button from closing
  useEffect(() => {
    if (!isOpen || !hasStarted) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault()
      window.history.pushState(null, "", window.location.href)
    }

    window.history.pushState(null, "", window.location.href)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [isOpen, hasStarted])

  // Run all ads simultaneously
  useEffect(() => {
    if (!isOpen || !hasStarted || allCompleted) return

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newTimes = prev.map(t => Math.max(0, t - 1))
        setAdProgress(newTimes.map(t => ((AD_DURATION - t) / AD_DURATION) * 100))
        setAdStatus(newTimes.map(t => t === 0 ? "completed" : "playing"))

        if (newTimes.every(t => t === 0)) {
          setAllCompleted(true)
        }
        return newTimes
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, hasStarted, allCompleted])

  const startWatching = useCallback(() => {
    setHasStarted(true)
    setAdStatus(Array(AD_COUNT).fill("playing"))
    setAdProgress(Array(AD_COUNT).fill(0))
    setTimeRemaining(Array(AD_COUNT).fill(AD_DURATION))
    setAllCompleted(false)
  }, [])

  const handleClaimBonus = async () => {
    if (!allCompleted || isClaiming) return
    setIsClaiming(true)

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          baseAmount,
          multiplier,
          cryptoSymbol
        })
      })

      if (response.ok) {
        const data = await response.json()
        const displayAmount = cryptoSymbol
          ? `${data.bonusAmount || bonusAmount} ${cryptoSymbol}`
          : `${data.bonusAmount || bonusAmount} satoshis`

        toast.success(`Bonus reward claimed! +${displayAmount}`, {
          description: `${multiplier}x multiplier applied`
        })

        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 }
        })

        onComplete?.(data.bonusAmount || bonusAmount)

        // Reset and close
        setTimeout(() => {
          setHasStarted(false)
          setAllCompleted(false)
          setAdProgress(Array(AD_COUNT).fill(0))
          setAdStatus(Array(AD_COUNT).fill("pending"))
          setTimeRemaining(Array(AD_COUNT).fill(AD_DURATION))
          onClose()
        }, 1500)
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to claim bonus reward")
      }
    } catch {
      toast.error("Failed to claim bonus reward")
    } finally {
      setIsClaiming(false)
    }
  }

  const handleCancel = () => {
    if (hasStarted && !allCompleted) {
      // Show warning if ads are playing
      if (!confirm("Are you sure? You will lose your progress and bonus reward.")) {
        return
      }
    }
    setHasStarted(false)
    setAllCompleted(false)
    setAdProgress(Array(AD_COUNT).fill(0))
    setAdStatus(Array(AD_COUNT).fill("pending"))
    setTimeRemaining(Array(AD_COUNT).fill(AD_DURATION))
    onClose()
  }

  if (!isOpen) return null

  const completedCount = adStatus.filter(s => s === "completed").length
  const overallProgress = (completedCount / AD_COUNT) * 100

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ touchAction: "none" }}
    >
      {/* Fullscreen backdrop - completely covers everything */}
      <div className={cn(
        "absolute inset-0 bg-background",
        `bg-gradient-to-br ${config.bgGradient}`
      )} />

      {/* Main content container */}
      <div className="relative h-full w-full flex flex-col overflow-y-auto">
        {/* Header - fixed at top */}
        <div className={cn(
          "sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b",
          config.borderColor
        )}>
          <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  `bg-gradient-to-br ${config.gradient}`
                )}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold">{config.title}</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">{config.description}</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMuted(!isMuted)}
                  className="h-8 w-8"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                {(!hasStarted || allCompleted) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancel}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
          {/* Reward Preview Card */}
          <div className={cn(
            "rounded-xl p-4 sm:p-6 mb-6 text-center",
            `bg-gradient-to-br ${config.bgGradient}`,
            "border",
            config.borderColor
          )}>
            <p className="text-sm text-muted-foreground mb-2">You will earn</p>
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className={cn(
                "text-4xl sm:text-5xl font-bold bg-clip-text text-transparent",
                `bg-gradient-to-r ${config.gradient}`
              )}>
                +{bonusAmount}
              </span>
              <span className="text-xl sm:text-2xl text-muted-foreground">
                {cryptoSymbol || "sats"}
              </span>
              <Badge className={cn("text-sm", `bg-gradient-to-r ${config.gradient} text-white`)}>
                {multiplier}x
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Base: {baseAmount} + Bonus: {bonusAmount} = Total: {totalAmount} {cryptoSymbol || "sats"}
            </p>
          </div>

          {!hasStarted ? (
            /* Start Screen */
            <div className="text-center py-8">
              <div className={cn(
                "inline-flex p-6 rounded-full mb-6",
                `bg-gradient-to-br ${config.bgGradient}`,
                "border-2",
                config.borderColor
              )}>
                <Play className="h-16 w-16 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to Watch {AD_COUNT} Ads?</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                All {AD_COUNT} ads will play simultaneously. You must watch all ads completely ({AD_DURATION} seconds each) to claim your {multiplier}x bonus.
              </p>
              <Button
                size="lg"
                className={cn("gap-3 text-lg px-8", `bg-gradient-to-r ${config.gradient} hover:opacity-90`)}
                onClick={startWatching}
              >
                <Play className="h-5 w-5" />
                Start Watching
              </Button>
            </div>
          ) : (
            /* Ad Playing Screen */
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Overall Progress</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {completedCount}/{AD_COUNT} completed
                    </span>
                    {allCompleted && (
                      <Badge className="bg-green-500 text-white animate-pulse">
                        Ready to Claim!
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress value={overallProgress} className="h-3" />
              </div>

              {/* 3 Google Rewarded Ads - Running Simultaneously */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <h3 className="font-semibold text-lg">Google Rewarded Ads ({AD_COUNT} Running Simultaneously)</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {Array.from({ length: AD_COUNT }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl border-2 p-4 transition-all",
                        adStatus[i] === "completed" && "bg-green-500/10 border-green-500/50",
                        adStatus[i] === "playing" && "bg-red-500/5 border-red-500/30 shadow-lg",
                        adStatus[i] === "pending" && "bg-muted/30 border-muted"
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                          <span className="font-semibold">Google Ad #{i + 1}</span>
                        </div>
                        {adStatus[i] === "completed" ? (
                          <div className="flex items-center gap-1 text-green-500">
                            <CheckCircle className="h-5 w-5" />
                            <span className="text-sm font-medium">Done</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-500">
                            <Clock className="h-4 w-4 animate-pulse" />
                            <span className="text-lg font-mono font-bold">{timeRemaining[i]}s</span>
                          </div>
                        )}
                      </div>
                      <Progress value={adProgress[i]} className="h-2 mb-3" />

                      {/* Google Rewarded Ad Content Area */}
                      <div
                        className={cn(
                          "aspect-video rounded-lg flex items-center justify-center overflow-hidden relative",
                          adStatus[i] === "completed" ? "bg-green-500/10" : "bg-gradient-to-br from-red-500/10 to-orange-500/10"
                        )}
                      >
                        {adStatus[i] === "playing" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4">
                            <div className="relative mb-3">
                              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                                <Play className="h-8 w-8 text-red-500" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                            </div>
                            <p className="text-sm font-medium text-center">Google Rewarded Ad</p>
                            <p className="text-xs text-muted-foreground text-center">60 Second Video</p>
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono">
                              {timeRemaining[i]}s
                            </div>
                          </div>
                        ) : adStatus[i] === "completed" ? (
                          <div className="text-center">
                            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                            <span className="text-sm text-green-600 font-medium">Completed</span>
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground">
                            <Play className="h-8 w-8 mx-auto mb-1 opacity-50" />
                            <span className="text-xs">Waiting...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* All 11 Partner Ad Networks - Displayed Below Google Ads */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    <h3 className="font-semibold">Partner Ad Networks (11 Networks)</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">All Displayed</Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {AD_NETWORKS.map((network) => (
                    <div
                      key={network.id}
                      className="rounded-lg overflow-hidden bg-muted/30 border border-border/50 hover:border-primary/30 transition-all"
                    >
                      <div className="px-2 py-1.5 bg-muted/50 border-b border-border/30 flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", network.color)} />
                        <span className="text-[10px] font-medium text-muted-foreground truncate">{network.name}</span>
                      </div>
                      <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
                        <div className="text-center p-2">
                          <div className={cn("w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center", network.color, "bg-opacity-20")}>
                            <div className={cn("w-3 h-3 rounded-full", network.color)} />
                          </div>
                          <p className="text-[8px] text-muted-foreground">{network.name}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  All 11 partner ad networks are displayed while you watch the 3 Google Rewarded Ads above
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer - fixed at bottom when ads are playing */}
        {hasStarted && (
          <div className={cn(
            "sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm border-t p-4",
            config.borderColor
          )}>
            <div className="max-w-4xl mx-auto flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
                disabled={isClaiming}
              >
                Cancel
              </Button>
              <Button
                className={cn(
                  "flex-1 gap-2 transition-all",
                  allCompleted && `bg-gradient-to-r ${config.gradient} hover:opacity-90`
                )}
                disabled={!allCompleted || isClaiming}
                onClick={handleClaimBonus}
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : allCompleted ? (
                  <>
                    <Coins className="h-4 w-4" />
                    Claim +{bonusAmount} {cryptoSymbol || "sats"}
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4" />
                    Complete All Ads ({completedCount}/{AD_COUNT})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
