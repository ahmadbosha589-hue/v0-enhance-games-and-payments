"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

interface Stats {
  totalUsers: number
  isLive: boolean
}

function formatUserCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M+`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K+`
  }
  if (count > 0) {
    return `${count}+`
  }
  return "Growing"
}

export function UserCountBadge() {
  const { t } = useLanguage()
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats", {
          next: { revalidate: 60 },
        })
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  // Generate badge text based on user count
  const getBadgeText = () => {
    if (isLoading) {
      return t("hero.badge", "Trusted by users worldwide")
    }
    
    if (!stats || !stats.isLive || stats.totalUsers === 0) {
      // Show a generic message when no users yet or data not available
      return t("hero.badgeNew", "Join our growing community today")
    }

    const userCount = formatUserCount(stats.totalUsers)
    return t("hero.badgeWithCount", `Trusted by ${userCount} users worldwide`).replace("{count}", userCount)
  }

  return (
    <div className="mb-6 sm:mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-medium text-primary shadow-[0_0_30px_-8px] shadow-primary/30 backdrop-blur-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-[0_0_8px_2px] shadow-primary/40" />
      </span>
      <span className="tracking-wide">{getBadgeText()}</span>
      <Sparkles className="h-3.5 w-3.5 opacity-70" />
    </div>
  )
}
