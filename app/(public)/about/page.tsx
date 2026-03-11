"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Shield, Zap, Users, Globe, TrendingUp, Award, CheckCircle, Heart, Target } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { motion } from "framer-motion"

const fetcher = async (url: string) => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return { totalUsers: 0, totalClaims: 0, totalDistributed: 0, isLive: false }
    return res.json()
  } catch {
    return { totalUsers: 0, totalClaims: 0, totalDistributed: 0, isLive: false }
  }
}

function formatNumber(num: number): string {
  if (!num || num === 0) return "0"
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M"
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K"
  return num.toLocaleString()
}

function formatBTC(satoshis: number): string {
  if (!satoshis || satoshis === 0) return "0 sats"
  const btc = satoshis / 100000000
  if (btc >= 1) return btc.toFixed(2) + " BTC"
  if (btc >= 0.01) return btc.toFixed(4) + " BTC"
  if (satoshis >= 1000000) return (satoshis / 1000000).toFixed(1) + "M sats"
  if (satoshis >= 1000) return (satoshis / 1000).toFixed(1) + "K sats"
  return satoshis.toLocaleString() + " sats"
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export default function AboutPage() {
  const { t, isRTL } = useLanguage()

  const { data: stats, isLoading } = useSWR("/api/stats", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    errorRetryCount: 1,
    fallbackData: { totalUsers: 0, totalClaims: 0, totalDistributed: 0, isLive: false },
  })

  const values = [
    {
      icon: Shield,
      titleKey: "about.values.security.title",
      descKey: "about.values.security.description",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: Zap,
      titleKey: "about.values.instant.title",
      descKey: "about.values.instant.description",
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      icon: Users,
      titleKey: "about.values.community.title",
      descKey: "about.values.community.description",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      icon: Globe,
      titleKey: "about.values.global.title",
      descKey: "about.values.global.description",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
  ]

  const whyChooseUs = [
    { icon: CheckCircle, titleKey: "about.why.noFees.title", descKey: "about.why.noFees.description" },
    { icon: Zap, titleKey: "about.why.instant.title", descKey: "about.why.instant.description" },
    { icon: Shield, titleKey: "about.why.secure.title", descKey: "about.why.secure.description" },
    { icon: Heart, titleKey: "about.why.support.title", descKey: "about.why.support.description" },
    { icon: Target, titleKey: "about.why.transparent.title", descKey: "about.why.transparent.description" },
    { icon: Award, titleKey: "about.why.reliable.title", descKey: "about.why.reliable.description" },
  ]

  const statsData = [
    {
      value: "2025",
      labelKey: "about.milestones.launch",
      icon: Award,
      isStatic: true,
    },
    {
      value: formatNumber(stats?.totalUsers || 0),
      labelKey: "about.milestones.users",
      icon: Users,
      isStatic: false,
    },
    {
      value: formatNumber(stats?.totalClaims || 0),
      labelKey: "about.milestones.claims",
      icon: TrendingUp,
      isStatic: false,
    },
    {
      value: formatBTC(stats?.totalDistributed || 0),
      labelKey: "about.milestones.distributed",
      icon: Zap,
      isStatic: false,
    },
  ]

  return (
    <div className="min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-16 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[250px] w-[250px] sm:h-[350px] sm:w-[350px] md:h-[500px] md:w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
        </div>

        <div className="container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-4xl text-center"
          >
            <div className="mb-4 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium text-primary">
              <Award className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>{t("about.badge")}</span>
            </div>

            <h1 className="mb-4 sm:mb-6 text-balance text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight">
              {t("about.title")} <span className="text-gradient-primary">{t("about.titleHighlight")}</span>{" "}
              {t("about.titleEnd")}
            </h1>

            <p className="mx-auto max-w-2xl text-pretty text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
              {t("about.description")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border/40 bg-muted/30 py-8 sm:py-12 md:py-16">
        <div className="container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6 sm:mb-8 md:mb-10"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">{t("about.stats.title")}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("about.stats.subtitle")}</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-4 max-w-4xl mx-auto"
          >
            {statsData.map((stat, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="text-center p-3 sm:p-4 md:p-6 border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/30 transition-colors">
                  <CardContent className="p-0">
                    <div className="mx-auto mb-2 sm:mb-3 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
                      <stat.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    {isLoading && !stat.isStatic ? (
                      <Skeleton className="h-6 sm:h-8 w-16 sm:w-20 mx-auto mb-1" />
                    ) : (
                      <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gradient-primary">
                        {stat.value}
                      </div>
                    )}
                    <div className="text-[10px] sm:text-xs md:text-sm text-muted-foreground mt-1">
                      {t(stat.labelKey as any)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-24">
        <div className="container px-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-8 sm:mb-12"
            >
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
                {t("about.story.title")}{" "}
                <span className="text-gradient-primary">{t("about.story.titleHighlight")}</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                {t("about.story.description")}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="grid gap-4 sm:gap-6 md:grid-cols-2"
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
                      <Target className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold">{t("about.story.mission.title")}</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {t("about.story.mission.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-amber-500/10">
                      <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold">{t("about.story.vision.title")}</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {t("about.story.vision.description")}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Our Values Section */}
      <section className="bg-muted/30 py-12 sm:py-16 md:py-20 lg:py-24">
        <div className="container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8 sm:mb-12"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
              {t("about.values.title")}{" "}
              <span className="text-gradient-primary">{t("about.values.titleHighlight")}</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">{t("about.values.subtitle")}</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          >
            {values.map((value, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="h-full border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-300">
                  <CardContent className="p-4 sm:p-6 text-center">
                    <div
                      className={`mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full ${value.bgColor}`}
                    >
                      <value.icon className={`h-6 w-6 sm:h-7 sm:w-7 ${value.color}`} />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2">{t(value.titleKey as any)}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {t(value.descKey as any)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-24">
        <div className="container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8 sm:mb-12"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
              {t("about.why.title")} <span className="text-gradient-primary">{t("about.why.titleHighlight")}</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">{t("about.why.subtitle")}</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          >
            {whyChooseUs.map((item, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="h-full border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 sm:p-6 flex gap-3 sm:gap-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
                        <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold mb-1">{t(item.titleKey as any)}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {t(item.descKey as any)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-muted/30 py-12 sm:py-16 md:py-20 lg:py-24">
        <div className="container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
              {t("about.cta.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">{t("about.cta.description")}</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Button size="lg" className="w-full sm:w-auto" asChild>
                <Link href="/auth/sign-up">{t("about.cta.getStarted")}</Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent" asChild>
                <Link href="/contact">{t("about.cta.learnMore")}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
