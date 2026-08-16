"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, TrendingUp, Users, Wallet, Shield, Zap } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export function FeaturesSection() {
  const { t } = useLanguage()

  const features = [
    {
      icon: Clock,
      titleKey: "features.claim.title" as const,
      descKey: "features.claim.description" as const,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: TrendingUp,
      titleKey: "features.streak.title" as const,
      descKey: "features.streak.description" as const,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      icon: Users,
      titleKey: "features.referral.title" as const,
      descKey: "features.referral.description" as const,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      icon: Wallet,
      titleKey: "features.withdraw.title" as const,
      descKey: "features.withdraw.description" as const,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      icon: Shield,
      titleKey: "features.security.title" as const,
      descKey: "features.security.description" as const,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      icon: Zap,
      titleKey: "features.dashboard.title" as const,
      descKey: "features.dashboard.description" as const,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ]

  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 lg:py-32" aria-labelledby="features-heading">
      <div className="container px-4 sm:px-6">
        {/* Header */}
        <div className="mx-auto mb-8 sm:mb-12 md:mb-16 max-w-2xl text-center">
          <motion.h2
            id="features-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-3 sm:mb-4 text-balance text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
          >
            {t("features.title")} <span className="text-gradient-primary">{t("features.titleHighlight")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-pretty text-sm sm:text-base text-muted-foreground"
          >
            {t("features.subtitle")}
          </motion.p>
        </div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-4 sm:gap-6 lg:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
        >
          {features.map((feature, index) => (
            <motion.div key={feature.titleKey} variants={itemVariants} role="listitem">
              <Card className="group relative h-full overflow-hidden border-border/40 bg-gradient-to-b from-card to-card/95 backdrop-blur-sm transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2">
                {/* Animated gradient border on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/[0.08] via-transparent to-accent/[0.05]" />
                </div>
                {/* Shine effect on hover */}
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <div className="absolute -inset-[100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_40%,oklch(from_var(--primary)_l_c_h_/_0.03)_50%,transparent_60%,transparent_100%)]" />
                </div>
                <CardHeader className="relative pb-3 sm:pb-4">
                  <div
                    className={`mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl ${feature.bgColor} ring-1 ring-inset ring-border/30 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:ring-primary/20`}
                  >
                    <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} transition-transform duration-500 group-hover:scale-110`} aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">{t(feature.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent className="relative pt-0">
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{t(feature.descKey)}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
