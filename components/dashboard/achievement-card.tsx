"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import confetti from "canvas-confetti"
import {
  Trophy,
  Zap,
  Flame,
  Coins,
  Users,
  Wallet,
  Gift,
  Play,
  Star,
  Lock,
  CheckCircle2,
  Crown,
  Gem,
  Rocket,
  Moon,
  Calendar,
  Loader2,
  Sparkles,
} from "lucide-react"

const BALANCE_UPDATE_EVENT = "faucero:balance-update"

interface Achievement {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: string
  requirement_type: string
  requirement_value: number
  reward_satoshis: number
  xp_reward: number
  badge_color: string
  is_hidden: boolean
  sort_order: number
}

interface UserAchievement {
  id: string
  achievement_id: string
  progress: number
  completed: boolean
  completed_at: string | null
  reward_claimed: boolean
  reward_claimed_at: string | null
}

interface AchievementCardProps {
  achievement: Achievement
  userAchievement?: UserAchievement
  calculatedProgress: number
  onBalanceUpdate?: (newBalance: number) => void
}

const iconMap: Record<string, any> = {
  trophy: Trophy,
  zap: Zap,
  flame: Flame,
  fire: Flame,
  coins: Coins,
  users: Users,
  wallet: Wallet,
  gift: Gift,
  play: Play,
  star: Star,
  crown: Crown,
  gem: Gem,
  rocket: Rocket,
  moon: Moon,
  calendar: Calendar,
}

const colorMap: Record<string, string> = {
  bronze: "from-amber-600 to-amber-800",
  silver: "from-gray-300 to-gray-500",
  gold: "from-yellow-400 to-yellow-600",
  platinum: "from-cyan-300 to-cyan-500",
  special: "from-purple-400 to-pink-500",
}

const categoryLabels: Record<string, string> = {
  claims: "Faucet Claims",
  earnings: "Earnings",
  referrals: "Referrals",
  streak: "Streaks",
  withdrawals: "Withdrawals",
  offerwalls: "Offerwalls",
  ptc: "PTC Ads",
  special: "Special",
}

export function AchievementCard({
  achievement,
  userAchievement,
  calculatedProgress,
  onBalanceUpdate,
}: AchievementCardProps) {
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimed, setClaimed] = useState(userAchievement?.reward_claimed || false)
  const router = useRouter()

  const currentProgress = userAchievement?.progress ?? calculatedProgress
  const progressPercent = Math.min((currentProgress / achievement.requirement_value) * 100, 100)

  // Achievement is complete if:
  // 1. Database says completed = true, OR
  // 2. Current progress >= requirement value (calculated dynamically)
  const isCompleted = userAchievement?.completed || currentProgress >= achievement.requirement_value

  const IconComponent = iconMap[achievement.icon] || Trophy

  const canClaim = isCompleted && !claimed

  const handleClaim = async () => {
    if (!canClaim || isClaiming) return

    setIsClaiming(true)

    try {
      const response = await fetch("/api/achievements/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ achievementId: achievement.id }),
      })

      const data = await response.json()

      if (data.success) {
        setClaimed(true)

        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#FFD700", "#FFA500", "#9333ea", "#22c55e"],
        })

        toast.success("Achievement Reward Claimed!", {
          description: `You received ${data.reward.toLocaleString()} satoshis and ${data.xp} XP for "${achievement.name}"`,
        })

        if (typeof window !== "undefined" && data.newBalance) {
          window.dispatchEvent(
            new CustomEvent(BALANCE_UPDATE_EVENT, {
              detail: { newBalance: data.newBalance, amount: data.reward, type: "achievement" },
            }),
          )
        }

        if (onBalanceUpdate && data.newBalance) {
          onBalanceUpdate(data.newBalance)
        }

        setTimeout(() => {
          window.location.reload()
        }, 300)
      } else {
        toast.error("Claim Failed", {
          description: data.error || "Failed to claim reward",
        })
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to claim reward. Please try again.",
      })
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 ${
        isCompleted
          ? claimed
            ? "border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent"
            : "border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent ring-2 ring-amber-500/30"
          : "hover:border-primary/50"
      }`}
    >
      {/* Badge Color Strip */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorMap[achievement.badge_color] || colorMap.bronze}`}
      />

      {/* Claim Available Indicator */}
      {canClaim && (
        <div className="absolute top-2 right-2 z-10">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${colorMap[achievement.badge_color] || colorMap.bronze} shadow-lg`}
          >
            <IconComponent className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="flex flex-col items-end gap-1">
            {claimed ? (
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Claimed
              </Badge>
            ) : isCompleted ? (
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 animate-pulse">
                <Sparkles className="h-3 w-3 mr-1" />
                Ready to Claim
              </Badge>
            ) : achievement.is_hidden ? (
              <Badge variant="outline" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                Hidden
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                {categoryLabels[achievement.category] || achievement.category}
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-base sm:text-lg mt-2">{achievement.name}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {achievement.is_hidden && !isCompleted ? "Complete to reveal..." : achievement.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress - show even when completed but not claimed */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className={isCompleted ? "text-green-500 font-medium" : ""}>
              {currentProgress.toLocaleString()} / {achievement.requirement_value.toLocaleString()}
              {isCompleted && " ✓"}
            </span>
          </div>
          <Progress value={progressPercent} className={`h-2 ${isCompleted ? "[&>div]:bg-green-500" : ""}`} />
        </div>

        {/* Rewards */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-yellow-500" />
              <span className="font-medium">{achievement.reward_satoshis.toLocaleString()} sats</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-purple-500" />
              <span className="font-medium">{achievement.xp_reward} XP</span>
            </div>
          </div>
        </div>

        {canClaim && (
          <Button
            onClick={handleClaim}
            disabled={isClaiming}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-semibold shadow-lg"
            size="sm"
          >
            {isClaiming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Claiming...
              </>
            ) : (
              <>
                <Gift className="h-4 w-4 mr-2" />
                Claim {achievement.reward_satoshis.toLocaleString()} Sats
              </>
            )}
          </Button>
        )}

        {/* Claimed timestamp */}
        {claimed && userAchievement?.reward_claimed_at && (
          <p className="text-xs text-muted-foreground text-center">
            Claimed on {new Date(userAchievement.reward_claimed_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
