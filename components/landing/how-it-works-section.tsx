"use client"

import { motion } from "framer-motion"
import { UserPlus, MousePointerClick, Coins, Banknote, CheckCircle2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

export function HowItWorksSection() {
  const { t } = useLanguage()

  const steps = [
    {
      icon: UserPlus,
      titleKey: "howItWorks.step1.title" as const,
      descKey: "howItWorks.step1.description" as const,
      features: ["howItWorks.step1.feature1", "howItWorks.step1.feature2", "howItWorks.step1.feature3"] as const,
    },
    {
      icon: MousePointerClick,
      titleKey: "howItWorks.step2.title" as const,
      descKey: "howItWorks.step2.description" as const,
      features: ["howItWorks.step2.feature1", "howItWorks.step2.feature2", "howItWorks.step2.feature3"] as const,
    },
    {
      icon: Coins,
      titleKey: "howItWorks.step3.title" as const,
      descKey: "howItWorks.step3.description" as const,
      features: ["howItWorks.step3.feature1", "howItWorks.step3.feature2", "howItWorks.step3.feature3"] as const,
    },
    {
      icon: Banknote,
      titleKey: "howItWorks.step4.title" as const,
      descKey: "howItWorks.step4.description" as const,
      features: ["howItWorks.step4.feature1", "howItWorks.step4.feature2", "howItWorks.step4.feature3"] as const,
    },
  ]

  return (
    <section
      id="how-it-works"
      className="bg-muted/30 py-12 sm:py-16 md:py-20 lg:py-32"
      aria-labelledby="how-it-works-heading"
    >
      <div className="container px-4 sm:px-6">
        {/* Header */}
        <div className="mx-auto mb-8 sm:mb-12 md:mb-16 max-w-2xl text-center">
          <motion.h2
            id="how-it-works-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-3 sm:mb-4 text-balance text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
          >
            {t("howItWorks.title")} <span className="text-gradient-primary">{t("howItWorks.titleHighlight")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-pretty text-sm sm:text-base text-muted-foreground"
          >
            {t("howItWorks.subtitle")}
          </motion.p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line - desktop only */}
          <div
            className="absolute left-0 right-0 top-8 hidden h-0.5 bg-gradient-to-r from-transparent via-border to-transparent lg:block"
            aria-hidden="true"
          />

          <ol
            className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Steps to get started"
          >
            {steps.map((step, index) => (
              <motion.li
                key={step.titleKey}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative text-center"
              >
                {/* Step icon */}
                <div className="mb-4 sm:mb-5 flex justify-center">
                  <div className="relative z-10 flex h-14 w-14 sm:h-18 sm:w-18 items-center justify-center rounded-2xl border-2 border-primary/60 bg-background shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-primary/30 hover:border-primary">
                    <step.icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <div className="mb-2 inline-flex items-center justify-center rounded-full bg-primary/10 px-3 py-0.5 sm:px-3.5 sm:py-1 text-xs font-semibold text-primary tracking-wide">
                  {t("howItWorks.step")} {index + 1}
                </div>
                <h3 className="mb-1 sm:mb-2 text-base sm:text-lg font-semibold">{t(step.titleKey)}</h3>
                <p className="mb-3 sm:mb-4 text-xs sm:text-sm text-muted-foreground">{t(step.descKey)}</p>

                {/* Feature list */}
                <ul className="space-y-1 text-left mx-auto max-w-[200px]" aria-label={`${t(step.titleKey)} features`}>
                  {step.features.map((featureKey) => (
                    <li key={featureKey} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-accent" aria-hidden="true" />
                      <span>{t(featureKey)}</span>
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
