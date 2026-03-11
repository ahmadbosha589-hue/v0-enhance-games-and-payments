"use client"

import { motion } from "framer-motion"
import { Bitcoin, Users, Zap, TrendingUp } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = async (url: string) => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return { totalDistributed: 0, totalUsers: 0, todayClaims: 0, totalClaims: 0, isLive: false }
    return res.json()
  } catch {
    return { totalDistributed: 0, totalUsers: 0, todayClaims: 0, totalClaims: 0, isLive: false }
  }
}

function formatNumber(num: number): string {
  if (!num || num === 0) return "0"
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M"
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K"
  return num.toLocaleString()
}

function formatSats(sats: number): string {
  if (!sats || sats === 0) return "0"
  if (sats >= 100000000) return (sats / 100000000).toFixed(2) + " BTC"
  if (sats >= 1000000) return (sats / 1000000).toFixed(1) + "M"
  if (sats >= 1000) return (sats / 1000).toFixed(1) + "K"
  return sats.toLocaleString()
}

export function StatsSection() {
  const { t } = useLanguage()

  const { data: dbStats, isLoading } = useSWR("/api/stats", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    errorRetryCount: 1,
    fallbackData: { totalDistributed: 0, totalUsers: 0, todayClaims: 0, totalClaims: 0, isLive: false },
  })

  const stats = [
    {
      icon: Bitcoin,
      label: t("stats.paidOut") || "Total Paid Out",
      value: formatSats(dbStats?.totalDistributed || 0),
      suffix: " sats",
      color: "text-primary",
    },
    {
      icon: Users,
      label: t("stats.users") || "Active Users",
      value: formatNumber(dbStats?.totalUsers || 0),
      suffix: "",
      color: "text-accent",
    },
    {
      icon: Zap,
      label: t("stats.claimsToday") || "Claims Today",
      value: formatNumber(dbStats?.todayClaims || 0),
      suffix: "",
      color: "text-chart-3",
    },
    {
      icon: TrendingUp,
      label: t("stats.totalClaims") || "Total Claims",
      value: formatNumber(dbStats?.totalClaims || 0),
      suffix: "",
      color: "text-chart-4",
    },
  ]

  return (
    <section className="border-y border-border/40 bg-muted/30 py-6 sm:py-12" aria-label="Platform statistics">
      <div className="container px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-6 md:gap-8 md:grid-cols-4" role="list">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center p-3 sm:p-5 rounded-xl bg-background/60 backdrop-blur-sm border border-border/30 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
              role="listitem"
            >
              <div className="mx-auto mb-2 sm:mb-3 flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-border/50">
                <stat.icon className={`h-4 w-4 sm:h-6 sm:w-6 ${stat.color}`} aria-hidden="true" />
              </div>
              {isLoading ? (
                <Skeleton className="h-6 sm:h-8 w-12 sm:w-16 mx-auto mb-1" />
              ) : (
                <div className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight">
                  <span className="text-gradient-primary">{stat.value}</span>
                  {stat.suffix && <span className="text-muted-foreground text-xs sm:text-base">{stat.suffix}</span>}
                </div>
              )}
              <div className="mt-0.5 sm:mt-1 text-[9px] sm:text-xs md:text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
