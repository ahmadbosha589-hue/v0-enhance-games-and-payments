"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Play, Clock, CheckCircle, Coins, Loader2, Sparkles, Gift, Zap } from "lucide-react"
import { toast } from "sonner"
import confetti from "canvas-confetti"
import { cn } from "@/lib/utils"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { isRewardedAdsEnabledClient } from "@/lib/rewards/rewarded-ads"
import { RewardedAdUnit } from "@/components/ads/rewarded-ad-unit"

export type BonusRewardType =
  | "shortlink_double"     // After completing shortlink - 2x reward
  | "coupon_double"        // After redeeming coupon - 2x reward
  | "ptc_double"           // After single PTC ad - 2x reward
  | "ptc_5x"               // After 5 PTC ads - 5x next reward
  | "faucet_double"        // After faucet claim - 2x reward
  | "manual_faucet_double" // After manual faucet - 2x reward

interface WatchAdBonusRewardProps {
  type: BonusRewardType
  baseAmount: number
  multiplier?: number
  isVisible?: boolean
  cryptoSymbol?: string
  onComplete?: (bonusAmount: number) => void
  className?: string
}

const TYPE_CONFIG: Record<BonusRewardType, {
  title: string
  description: string
  buttonText: string
  buttonSubtext: string
  icon: typeof Gift
  gradient: string
  borderColor: string
}> = {
  shortlink_double: {
    title: "Double Your Shortlink Reward",
    description: "Watch 3 ads (60 seconds each) to receive 2x your shortlink earnings",
    buttonText: "Watch Ads to Double Reward",
    buttonSubtext: "Earn 2x your shortlink reward",
    icon: Gift,
    gradient: "from-blue-500/20 to-cyan-500/10",
    borderColor: "border-blue-500/30"
  },
  coupon_double: {
    title: "Double Your Coupon Reward",
    description: "Watch 3 ads (60 seconds each) to receive 2x your coupon earnings",
    buttonText: "Watch Ads to Double Coupon",
    buttonSubtext: "Earn 2x your coupon reward",
    icon: Sparkles,
    gradient: "from-purple-500/20 to-pink-500/10",
    borderColor: "border-purple-500/30"
  },
  ptc_double: {
    title: "Double Your PTC Reward",
    description: "Watch 3 ads (60 seconds each) to receive 2x your PTC earnings",
    buttonText: "Watch Ads to Double PTC Reward",
    buttonSubtext: "Earn 2x your PTC ad reward",
    icon: Gift,
    gradient: "from-green-500/20 to-emerald-500/10",
    borderColor: "border-green-500/30"
  },
  ptc_5x: {
    title: "Milestone Bonus Unlocked!",
    description: "Congratulations! You completed 5 PTC ads. Claim your 5x bonus reward now!",
    buttonText: "Claim 5x Milestone Bonus",
    buttonSubtext: "Earned by watching 5 PTC ads",
    icon: Zap,
    gradient: "from-amber-500/20 to-orange-500/10",
    borderColor: "border-amber-500/30"
  },
  faucet_double: {
    title: "Double Your Faucet Reward",
    description: "Watch 3 ads (60 seconds each) to receive 2x your faucet claim",
    buttonText: "Watch Ads to Double Reward",
    buttonSubtext: "Earn 2x your faucet claim",
    icon: Coins,
    gradient: "from-green-500/20 to-emerald-500/10",
    borderColor: "border-green-500/30"
  },
  manual_faucet_double: {
    title: "Double Your Manual Faucet Reward",
    description: "Watch 3 ads (60 seconds each) to receive 2x your claim",
    buttonText: "Watch Ads to Double Reward",
    buttonSubtext: "Earn 2x your crypto reward",
    icon: Coins,
    gradient: "from-amber-500/20 to-yellow-500/10",
    borderColor: "border-amber-500/30"
  }
}

export function WatchAdBonusReward({
  type,
  baseAmount,
  multiplier = 2,
  isVisible = true,
  cryptoSymbol,
  onComplete,
  className
}: WatchAdBonusRewardProps) {
  const [showModal, setShowModal] = useState(false)
  const [verifiedTokens, setVerifiedTokens] = useState<string[]>([])
  const [allCompleted, setAllCompleted] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)

  const config = TYPE_CONFIG[type]
  const bonusAmount = Math.floor(baseAmount * (multiplier - 1))
  const totalAmount = Math.floor(baseAmount * multiplier)
  const Icon = config.icon

  const startAds = useCallback(() => {
    setShowModal(true)
    setVerifiedTokens([])
    setAllCompleted(false)
  }, [])

  const handleClaimBonus = async () => {
    if (!allCompleted || isClaiming) return
    setIsClaiming(true)

    try {
      const response = await fetch("/api/bonus-reward/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          watchToken: verifiedTokens[0],
        })
      })

      if (response.ok) {
        const data = await response.json()
        const displayAmount = cryptoSymbol
          ? `${data.bonusAmount} ${cryptoSymbol}`
          : `${data.bonusAmount} satoshis`

        toast.success(`Bonus reward claimed! +${displayAmount}`, {
          description: `${multiplier}x multiplier applied`
        })

        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })

        setShowModal(false)
        onComplete?.(data.bonusAmount)
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

  // Render NOTHING unless rewarded ads are actually configured for this
  // deployment. Showing the "watch 3 ads" upsell without inventory would send
  // users into guaranteed-503 claims — simulated inventory is worse than none.
  // This also keeps PTC-style ad upsells off pages where they don't belong.
  if (!isVisible || baseAmount <= 0) return null
  if (!isRewardedAdsEnabledClient()) {
    return null
  }

  return (
    <>
      {/* Trigger Button */}
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "gap-2 transition-all duration-300",
          config.borderColor,
          "hover:scale-[1.02] hover:shadow-md",
          className
        )}
        onClick={startAds}
      >
        <Play className="h-3 w-3" />
        {config.buttonText}
      </Button>
      {baseAmount > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          +{bonusAmount} {cryptoSymbol || "sats"} bonus ({multiplier}x)
        </p>
      )}

      {/* Modal with 3 Partner Ads + 11 Ad Networks + c.cx.ua.
          Sizing strategy is generous on every breakpoint so each ad slot
          renders close to its native 300×250 medium-rectangle size for
          the strongest impressions:
            • Mobile: full-bleed (w-full) — no wasted side padding.
            • sm (≥640): max-w-2xl  — phones in landscape
            • md (≥768): max-w-4xl  — tablets
            • lg (≥1024): max-w-6xl — laptops
            • xl (≥1280): max-w-[1440px] — desktops (wide enough for the
              12-slot grid to render 3×4 without crowding).
            • Always scrolls vertically — never clips ad slots. */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/90 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <Card
            className={cn(
              "w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-[1440px]",
              "my-0 sm:my-4 rounded-none sm:rounded-2xl",
              "min-h-screen sm:min-h-0",
              config.borderColor
            )}
          >
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl lg:text-2xl">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary" />
                {config.title}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm lg:text-base">{config.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              {/* Reward Preview */}
              <div className={cn(
                "rounded-lg p-4 sm:p-6 text-center",
                `bg-gradient-to-br ${config.gradient}`
              )}>
                <p className="text-sm text-muted-foreground mb-1">You will earn</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-bold text-primary">
                    +{bonusAmount}
                  </span>
                  <span className="text-lg sm:text-xl text-muted-foreground">
                    {cryptoSymbol || "sats"}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {multiplier}x Bonus
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                  Base: {baseAmount} {cryptoSymbol || "sats"} + Bonus: {bonusAmount} = Total: {totalAmount}
                </p>
              </div>

              {/* 3 verified rewarded-ad units. Each unit only completes when
                  the provider's server-to-server callback confirms the view and
                  mints a single-use claim token — client timers never unlock
                  rewards on their own. The bonus pays once, on the first
                  verified token (server-enforced via the event ledger). */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
                {[0, 1, 2].map((i) => (
                  <RewardedAdUnit
                    key={`${type}-${i}`}
                    index={i}
                    seconds={20}
                    onVerified={(token) => {
                      setVerifiedTokens(prev => {
                        const next = prev.includes(token) ? prev : [...prev, token]
                        if (!allCompleted) setAllCompleted(true)
                        return next
                      })
                    }}
                  />
                ))}
              </div>

              {/* Status */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="flex-1 text-xs text-muted-foreground">
                  Watch an ad until it verifies, then claim your bonus. Rewards pay
                  once per verified view.
                </div>
                {allCompleted && (
                  <Badge className="bg-green-500 text-white animate-pulse">
                    Ready to Claim!
                  </Badge>
                )}
              </div>

              {/* 11 Other Ad Networks */}
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Partner Advertisements
                </p>
                <MultiNetworkAds position="content" layout="inline" showLabels={false} priority="high" />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={cn(
                    "flex-1 gap-2 transition-all",
                    allCompleted && "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
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
                      Complete All Ads
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

// Convenience wrapper for PTC 5x bonus (shows as milestone after every 5 ads watched)
export function PTCBonusReward({
  adsWatchedToday,
  nextAdReward,
  className
}: {
  adsWatchedToday: number
  nextAdReward: number
  className?: string
}) {
  // Show 5x milestone bonus after every 5 ads watched (5, 10, 15, 20...)
  const shouldShow = adsWatchedToday > 0 && adsWatchedToday % 5 === 0
  const milestoneNumber = Math.floor(adsWatchedToday / 5)

  if (!shouldShow) return null

  return (
    <Card className={cn(
      "border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10",
      "shadow-lg shadow-amber-500/10 animate-in fade-in slide-in-from-top-2 duration-500",
      className
    )}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Milestone Badge */}
          <div className="relative">
            <div className="p-3 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/20 ring-2 ring-amber-500/30">
              <Zap className="h-6 w-6 text-amber-500" />
            </div>
            <Badge className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5">
              x5
            </Badge>
          </div>

          {/* Milestone Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <p className="font-bold text-base sm:text-lg text-amber-600 dark:text-amber-400">
                Milestone #{milestoneNumber} Reached!
              </p>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                {adsWatchedToday} PTC Ads
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Congratulations! You&apos;ve earned a <span className="font-semibold text-amber-500">5x bonus reward</span> for watching {adsWatchedToday} PTC ads.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Next milestone at {adsWatchedToday + 5} ads
            </p>
          </div>

          {/* Claim Button */}
          <div className="flex flex-col items-center gap-1">
            <WatchAdBonusReward
              type="ptc_5x"
              baseAmount={nextAdReward}
              multiplier={5}
              className="bg-gradient-to-r from-amber-500 to-orange-500 border-0 text-white hover:from-amber-600 hover:to-orange-600 shadow-md"
            />
            <span className="text-[10px] text-amber-600/70">
              +{nextAdReward * 4} sats bonus
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
