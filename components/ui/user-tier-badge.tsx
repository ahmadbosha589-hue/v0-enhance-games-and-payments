"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Crown, Sparkles, Shield, Star, Zap, Rocket } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type UserTier = "basic" | "pro" | "elite" | "legend" | "none"

interface UserTierBadgeProps {
  tier: UserTier
  size?: "xs" | "sm" | "md" | "lg"
  showLabel?: boolean
  showTooltip?: boolean
  className?: string
}

const TIER_CONFIG: Record<UserTier, {
  label: string
  icon: typeof Crown
  colors: string
  bgColors: string
  borderColors: string
  gradient: string
  description: string
}> = {
  none: {
    label: "Free",
    icon: Star,
    colors: "text-muted-foreground",
    bgColors: "bg-muted/50",
    borderColors: "border-muted",
    gradient: "from-muted to-muted",
    description: "Free tier - No booster active"
  },
  basic: {
    label: "Basic",
    icon: Zap,
    colors: "text-blue-500",
    bgColors: "bg-blue-500/10",
    borderColors: "border-blue-500/30",
    gradient: "from-blue-500 to-cyan-400",
    description: "Basic Booster - 100% faucet bonus, 10% offerwall bonus"
  },
  pro: {
    label: "Pro",
    icon: Rocket,
    colors: "text-emerald-500",
    bgColors: "bg-emerald-500/10",
    borderColors: "border-emerald-500/30",
    gradient: "from-emerald-500 to-teal-400",
    description: "Pro Booster - 200% faucet bonus, 20% offerwall bonus"
  },
  elite: {
    label: "Elite",
    icon: Shield,
    colors: "text-amber-500",
    bgColors: "bg-amber-500/10",
    borderColors: "border-amber-500/30",
    gradient: "from-amber-500 to-orange-400",
    description: "Elite Booster - 300% faucet bonus, 35% offerwall bonus"
  },
  legend: {
    label: "Legend",
    icon: Crown,
    colors: "text-fuchsia-500",
    bgColors: "bg-fuchsia-500/10",
    borderColors: "border-fuchsia-500/30",
    gradient: "from-fuchsia-500 via-purple-500 to-pink-500",
    description: "Legend Booster - 500% faucet bonus, 50% offerwall bonus"
  }
}

const SIZE_CONFIG = {
  xs: {
    badge: "text-[9px] px-1 py-0 h-4 gap-0.5",
    icon: "h-2.5 w-2.5",
  },
  sm: {
    badge: "text-[10px] px-1.5 py-0.5 h-5 gap-1",
    icon: "h-3 w-3",
  },
  md: {
    badge: "text-xs px-2 py-1 h-6 gap-1.5",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    badge: "text-sm px-3 py-1.5 h-8 gap-2",
    icon: "h-4 w-4",
  }
}

export function UserTierBadge({
  tier,
  size = "sm",
  showLabel = true,
  showTooltip = true,
  className
}: UserTierBadgeProps) {
  const config = TIER_CONFIG[tier]
  const sizeConfig = SIZE_CONFIG[size]
  const Icon = config.icon

  const badgeContent = (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold inline-flex items-center shrink-0",
        config.colors,
        config.bgColors,
        config.borderColors,
        sizeConfig.badge,
        tier === "legend" && "animate-pulse",
        className
      )}
    >
      <Icon className={cn(sizeConfig.icon, "shrink-0")} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  )

  if (!showTooltip) {
    return badgeContent
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-center">
          <p className="font-semibold">{config.label} Tier</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Compact badge for tables and lists
export function UserTierBadgeCompact({
  tier,
  className
}: { tier: UserTier; className?: string }) {
  if (tier === "none") return null
  
  const config = TIER_CONFIG[tier]
  const Icon = config.icon

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center justify-center h-5 w-5 rounded-full shrink-0",
              config.bgColors,
              config.borderColors,
              "border",
              tier === "legend" && "animate-pulse",
              className
            )}
          >
            <Icon className={cn("h-2.5 w-2.5", config.colors)} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="font-semibold">{config.label} Booster</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Gradient text badge for special displays
export function UserTierBadgeGradient({
  tier,
  className
}: { tier: UserTier; className?: string }) {
  if (tier === "none") return null
  
  const config = TIER_CONFIG[tier]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
        "bg-gradient-to-r",
        config.gradient,
        "text-white font-semibold text-xs",
        tier === "legend" && "animate-pulse shadow-lg shadow-fuchsia-500/25",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  )
}
