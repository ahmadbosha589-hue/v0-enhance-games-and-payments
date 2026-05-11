"use client"

import { useState } from "react"
import useSWR from "swr"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  Gift, ExternalLink, TrendingUp, Clock, Coins, CheckCircle2,
  AlertCircle, Star, Users, Zap, Sparkles, Trophy, Target,
  ArrowRight, Flame, Award, ClipboardList, Search, Filter,
  Play, DollarSign, BarChart3, Wallet
} from "lucide-react"
import { cn } from "@/lib/utils"

interface OfferwallsContentProps {
  userId: string
}

interface OfferwallData {
  id: string
  name: string
  slug: string
  description: string
  logo: string
  color: string
  bgGradient: string
  minPayout: number
  conversionRate: number
  features: string[]
  url: string
  active: boolean
  priority: number
  type: "offerwall" | "survey" // Type to distinguish between offerwalls and surveys
  stats: {
    total_paid: number
    completion_count: number
    user_earnings: number
    user_completions: number
  } | null
}

interface PlatformStats {
  total_paid_all_offerwalls: number
  total_completions: number
  active_offerwalls: number
}

// Offerwall metadata — type classification only.
// Logos are loaded from each provider's `logo` field returned by the API,
// with a polished gradient-letter fallback rendered when missing/broken.
const OFFERWALL_META: Record<string, { type: "offerwall" | "survey" }> = {
  ccxua: { type: "offerwall" },
  cpx: { type: "survey" },
  "cpx-research": { type: "survey" },
  bitlabs: { type: "survey" },
  pollfish: { type: "survey" },
  theoremreach: { type: "survey" },
  inbrain: { type: "survey" },
  offertoro: { type: "offerwall" },
  adgate: { type: "offerwall" },
  adgatemedia: { type: "offerwall" },
  adgem: { type: "offerwall" },
  lootably: { type: "offerwall" },
  torox: { type: "offerwall" },
  ayet: { type: "offerwall" },
  "ayet-studios": { type: "offerwall" },
  timewall: { type: "offerwall" },
  wannads: { type: "offerwall" },
  monlix: { type: "offerwall" },
  notik: { type: "offerwall" },
  revu: { type: "offerwall" },
  revenue: { type: "offerwall" },
  "mm-wall": { type: "offerwall" },
  mmwall: { type: "offerwall" },
  kiwi: { type: "offerwall" },
  hang: { type: "offerwall" },
  hangmyads: { type: "offerwall" },
  "hang-my-ads": { type: "offerwall" },
  "offerwall-me": { type: "offerwall" },
  offerwallme: { type: "offerwall" },
  bicotasks: { type: "offerwall" },
  adscend: { type: "offerwall" },
  cpalead: { type: "offerwall" },
  minutestaff: { type: "offerwall" },
}

// Generate beautiful brand initials for fallback logo rendering
function getBrandInitials(name: string): string {
  // For dotted brands (e.g. "c.cx.ua"), keep the form
  if (name.includes(".") && name.length <= 10) return name
  const parts = name.split(/[\s\-_]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function StatsCards({ platformStats, userStats }: {
  platformStats: PlatformStats | null
  userStats: { total_earned: number; total_completions: number }
}) {
  const stats = [
    {
      label: "Your Earnings",
      value: userStats.total_earned,
      formatted: `${userStats.total_earned.toLocaleString()} sats`,
      icon: Wallet,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20"
    },
    {
      label: "Completions",
      value: userStats.total_completions,
      formatted: userStats.total_completions.toString(),
      icon: CheckCircle2,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20"
    },
    {
      label: "Total Paid Out",
      value: platformStats?.total_paid_all_offerwalls || 0,
      formatted: `${((platformStats?.total_paid_all_offerwalls || 0) / 1000).toFixed(1)}k sats`,
      icon: BarChart3,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20"
    },
    {
      label: "Active Partners",
      value: platformStats?.active_offerwalls || 0,
      formatted: (platformStats?.active_offerwalls || 0).toString(),
      icon: Gift,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20"
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className={cn("border-border/50 hover:shadow-md transition-all duration-200", stat.borderColor)}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", stat.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-sm sm:text-lg font-bold truncate">{stat.formatted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Enhanced Offerwall Card with Logo Image
function OfferwallCard({ offerwall, userId, variant = "default" }: {
  offerwall: OfferwallData
  userId: string
  variant?: "default" | "featured" | "compact"
}) {
  const getOfferwallUrl = () => {
    return offerwall.url
      .replace("{user_id}", userId)
      .replace("{ccxua_api_key}", process.env.NEXT_PUBLIC_CCXUA_API_KEY || "")
      .replace("{app_id}", process.env.NEXT_PUBLIC_CPX_APP_ID || "")
      .replace("{pub_id}", process.env.NEXT_PUBLIC_TOROX_PUB_ID || "")
      .replace("{wall_code}", process.env.NEXT_PUBLIC_ADGATE_WALL_CODE || "")
      .replace("{placement_id}", process.env.NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID || "")
      .replace("{api_token}", process.env.NEXT_PUBLIC_BITLABS_TOKEN || "")
      .replace("{api_key}", process.env.NEXT_PUBLIC_TIMEWALL_KEY || "")
      .replace("{adslot_id}", process.env.NEXT_PUBLIC_AYET_ADSLOT || "")
      .replace("{player_id}", process.env.NEXT_PUBLIC_ADGEM_PLAYER_ID || "")
      .replace("{gateway_id}", process.env.NEXT_PUBLIC_CPALEAD_GATEWAY || "")
  }

  const totalPaid = offerwall.stats?.total_paid || 0
  const userEarnings = offerwall.stats?.user_earnings || 0
  const completions = offerwall.stats?.completion_count || 0
  const isPopular = totalPaid > 50000 || completions > 100
  const isHot = totalPaid > 100000
  const isSurvey = offerwall.type === "survey"
  const isNew = offerwall.priority === 0
  const isFeatured = isNew || variant === "featured"

  // Logo: prefer the API-supplied logo, then a local /images path; track load errors
  // so we can swap to the polished gradient-initials fallback.
  const logoUrl = offerwall.logo
  const initials = getBrandInitials(offerwall.name)
  const [logoError, setLogoError] = useState(false)
  const showLogo = !!logoUrl && !logoError

  if (variant === "compact") {
    return (
      <a
        href={getOfferwallUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <Card className={cn(
          "relative overflow-hidden transition-all duration-300",
          "hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30",
          "cursor-pointer",
          isNew && "border-cyan-500/40"
        )}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div
                className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/40"
                style={{ background: `linear-gradient(135deg, ${offerwall.color}25 0%, ${offerwall.color}05 100%)` }}
              >
                {showLogo ? (
                  <Image
                    src={logoUrl}
                    alt={offerwall.name}
                    width={48}
                    height={48}
                    className="object-contain p-1.5"
                    onError={() => setLogoError(true)}
                    unoptimized
                  />
                ) : (
                  <span
                    className="text-base font-bold tracking-tight"
                    style={{ color: offerwall.color }}
                  >
                    {initials}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{offerwall.name}</h3>
                  {isHot && (
                    <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  )}
                  {isNew && (
                    <Sparkles className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{offerwall.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {isSurvey ? "Survey" : "Offers"}
                  </Badge>
                  {userEarnings > 0 && (
                    <span className="text-[10px] text-green-500 font-medium">
                      +{userEarnings.toLocaleString()} sats
                    </span>
                  )}
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </CardContent>
        </Card>
      </a>
    )
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 flex flex-col h-full",
        "hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1",
        isFeatured && "border-2 border-primary/30",
        isNew && "border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/5"
      )}
    >
      {/* "NEW" ribbon for newest providers */}
      {isNew && (
        <div className="absolute top-3 -right-8 z-10 rotate-45 bg-gradient-to-r from-cyan-500 to-teal-500 px-10 py-0.5 text-[10px] font-bold text-white shadow-md">
          NEW
        </div>
      )}

      {/* Header with Logo */}
      <div
        className="relative h-28 sm:h-32 w-full overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${offerwall.color}35 0%, ${offerwall.color}12 50%, transparent 100%)`
        }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-2 w-20 h-20 rounded-full bg-foreground/20" />
          <div className="absolute bottom-0 left-0 w-32 h-16 rounded-tr-full bg-foreground/10" />
        </div>

        {/* Logo */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {showLogo ? (
            <div className="relative h-16 w-32 sm:h-20 sm:w-40">
              <Image
                src={logoUrl}
                alt={offerwall.name}
                fill
                sizes="160px"
                className="object-contain drop-shadow-lg"
                onError={() => setLogoError(true)}
                unoptimized
              />
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl bg-background/95 shadow-lg backdrop-blur-sm ring-1 ring-border/50"
            >
              <span
                className="text-2xl sm:text-3xl font-bold tracking-tight leading-none"
                style={{ color: offerwall.color }}
              >
                {initials}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
                {offerwall.name}
              </span>
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {isHot && (
            <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 text-[10px] gap-0.5 shadow-lg">
              <Flame className="h-3 w-3" />
              Hot
            </Badge>
          )}
          {isPopular && !isHot && (
            <Badge variant="secondary" className="text-[10px] gap-0.5 shadow-sm">
              <TrendingUp className="h-3 w-3" />
              Popular
            </Badge>
          )}
        </div>

        {/* Type Badge */}
        <div className="absolute top-2 left-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] gap-1 bg-background/90 backdrop-blur-sm shadow-sm",
              isSurvey ? "border-blue-500/30 text-blue-600" : "border-green-500/30 text-green-600"
            )}
          >
            {isSurvey ? (
              <>
                <ClipboardList className="h-3 w-3" />
                Survey
              </>
            ) : (
              <>
                <Gift className="h-3 w-3" />
                Offers
              </>
            )}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-3 flex-1 flex flex-col p-4">
        {/* Title and Description */}
        <div>
          <h3 className="font-semibold text-base">{offerwall.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {offerwall.description}
          </p>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-1">
          {offerwall.features.slice(0, 3).map((feature) => (
            <Badge
              key={feature}
              variant="secondary"
              className="text-[9px] sm:text-[10px] px-1.5 py-0 font-normal h-5"
            >
              {feature}
            </Badge>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col p-2 rounded-lg bg-muted/50 border border-border/50">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5" />
              Total Paid
            </span>
            <span className="text-sm font-bold text-green-500">
              {totalPaid >= 1000 ? `${(totalPaid / 1000).toFixed(0)}k` : totalPaid} sats
            </span>
          </div>
          <div className="flex flex-col p-2 rounded-lg bg-muted/50 border border-border/50">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              Completions
            </span>
            <span className="text-sm font-bold">
              {completions >= 1000 ? `${(completions / 1000).toFixed(0)}k` : completions}
            </span>
          </div>
        </div>

        {/* User earnings highlight */}
        {userEarnings > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Award className="h-3.5 w-3.5" />
              Your Earnings
            </span>
            <span className="text-sm font-bold text-green-500">
              {userEarnings.toLocaleString()} sats
            </span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA Button */}
        <Button
          className="w-full gap-2 group/btn transition-all"
          size="default"
          asChild
        >
          <a href={getOfferwallUrl()} target="_blank" rel="noopener noreferrer">
            <Play className="h-4 w-4" />
            <span>{isSurvey ? "Take Surveys" : "View Offers"}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function OfferwallsGrid({ offerwalls, userId, variant = "default" }: {
  offerwalls: OfferwallData[]
  userId: string
  variant?: "default" | "compact"
}) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOfferwalls = offerwalls.filter(o =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!offerwalls || offerwalls.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
          <div className="p-4 rounded-full bg-muted/50 mb-4">
            <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">No Partners Available</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center max-w-sm">
            Please check back later. New offerwalls and surveys are added regularly.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search offerwalls..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {variant === "compact" ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {filteredOfferwalls.map((offerwall) => (
            <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredOfferwalls.map((offerwall) => (
            <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecentCompletions({ userId }: { userId: string }) {
  const { data, isLoading } = useSWR(
    `/api/transactions?type=offerwall&limit=5`,
    fetcher,
    { refreshInterval: 60000 }
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  }

  const completions = data?.transactions || []

  if (completions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Gift className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" />
        </div>
        <p className="text-sm sm:text-base font-medium mb-1">No completed offers yet</p>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">
          Complete an offer or survey to see your history here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {completions.map((completion: any) => (
        <div
          key={completion.id}
          className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{completion.description || "Offer Completed"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(completion.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-green-600 bg-green-500/10 shrink-0 ml-2">
            +{completion.amount_satoshis?.toLocaleString() || completion.amount?.toLocaleString()} sats
          </Badge>
        </div>
      ))}
    </div>
  )
}

function LaunchBonusBanner() {
  return (
    <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-orange-500/10 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/20 to-transparent rounded-bl-full" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 shrink-0">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-amber-600 dark:text-amber-400 text-sm sm:text-base">
                Launch Bonus Active!
              </p>
              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
                +10% All Earnings
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Earn 10% bonus on all offerwall and survey completions. Limited time!
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OfferwallsContent({ userId }: OfferwallsContentProps) {
  const [activeTab, setActiveTab] = useState("all")

  const { data, isLoading, error } = useSWR(
    `/api/offerwalls?stats=true`,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
      dedupingInterval: 30000
    }
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 sm:h-24" />
          ))}
        </div>
        <Skeleton className="h-24" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
          <div className="p-4 rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-destructive/70" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">Failed to Load</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mb-4">
            There was an error loading offerwalls. Please try again.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const offerwalls: OfferwallData[] = (data?.offerwalls || []).map((o: any) => {
    const slug = o.slug?.toLowerCase() ?? ""
    const name = o.name?.toLowerCase() ?? ""
    const metaType = OFFERWALL_META[slug]?.type
    const heuristicSurvey =
      name.includes("survey") ||
      slug.includes("cpx") ||
      slug.includes("bitlabs") ||
      slug.includes("pollfish") ||
      slug.includes("theoremreach") ||
      slug.includes("inbrain")
    return {
      ...o,
      type: metaType ?? (heuristicSurvey ? "survey" : "offerwall"),
    }
  })

  const platformStats: PlatformStats = data?.platformStats || {
    total_paid_all_offerwalls: 0,
    total_completions: 0,
    active_offerwalls: 0,
  }

  const surveys = offerwalls.filter(o => o.type === "survey")
  const offerwallsOnly = offerwalls.filter(o => o.type === "offerwall")

  const userStats = {
    total_earned: offerwalls.reduce((sum, o) => sum + (o.stats?.user_earnings || 0), 0),
    total_completions: offerwalls.reduce((sum, o) => sum + (o.stats?.user_completions || 0), 0),
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Stats */}
      <StatsCards platformStats={platformStats} userStats={userStats} />

      {/* Launch Bonus Banner */}
      <LaunchBonusBanner />

      {/* Tabs - Split between All, Surveys, Offerwalls, History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-5">
        <TabsList className="grid w-full grid-cols-4 max-w-lg h-10 sm:h-11">
          <TabsTrigger value="all" className="text-xs sm:text-sm gap-1.5">
            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">All</span>
          </TabsTrigger>
          <TabsTrigger value="surveys" className="text-xs sm:text-sm gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Surveys</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
              {surveys.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="offerwalls" className="text-xs sm:text-sm gap-1.5">
            <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Offers</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
              {offerwallsOnly.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm gap-1.5">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 sm:mt-5 space-y-6">
          {/* New Partner — c.cx.ua and any priority-0 wall */}
          {offerwalls.filter(o => o.priority === 0).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-500" />
                <h2 className="text-lg font-semibold">New Partner</h2>
                <Badge className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-0 text-[10px]">
                  Just Added
                </Badge>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {offerwalls
                  .filter(o => o.priority === 0)
                  .map((offerwall) => (
                    <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} variant="featured" />
                  ))}
              </div>
            </div>
          )}

          {/* Featured Section - Hot Offerwalls */}
          {offerwalls.filter(o => o.priority !== 0 && o.stats && o.stats.total_paid > 100000).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-semibold">Hot Right Now</h2>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {offerwalls
                  .filter(o => o.priority !== 0 && o.stats && o.stats.total_paid > 100000)
                  .slice(0, 3)
                  .map((offerwall) => (
                    <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} variant="featured" />
                  ))}
              </div>
            </div>
          )}

          {/* All Offerwalls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">All Partners</h2>
            </div>
            <OfferwallsGrid offerwalls={offerwalls} userId={userId} />
          </div>
        </TabsContent>

        <TabsContent value="surveys" className="mt-4 sm:mt-5 space-y-4">
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ClipboardList className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Survey Tips</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete your profile honestly for better survey matching. Take your time and answer questions carefully to avoid disqualification.
                </p>
              </div>
            </CardContent>
          </Card>
          <OfferwallsGrid offerwalls={surveys} userId={userId} />
        </TabsContent>

        <TabsContent value="offerwalls" className="mt-4 sm:mt-5 space-y-4">
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Gift className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Offerwall Tips</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Look for high-paying app install offers. Game offers that require reaching certain levels can be very rewarding!
                </p>
              </div>
            </CardContent>
          </Card>
          <OfferwallsGrid offerwalls={offerwallsOnly} userId={userId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 sm:mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                Recent Completions
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Your recently completed offers and surveys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecentCompletions userId={userId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
