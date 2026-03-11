"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, Gift } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

export function CTASection() {
  const { t } = useLanguage()

  return (
    <section className="relative overflow-hidden py-16 sm:py-20 md:py-24 lg:py-36" aria-labelledby="cta-heading">
      {/* Premium multi-layer background */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        {/* Central glow */}
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] sm:h-[500px] sm:w-[700px] md:h-[600px] md:w-[900px] lg:h-[700px] lg:w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-[120px]" />
        {/* Left accent */}
        <div className="absolute left-0 top-1/3 h-[250px] w-[250px] sm:h-[300px] sm:w-[300px] -translate-x-1/2 rounded-full bg-accent/10 blur-[100px]" />
        {/* Right accent */}
        <div className="absolute right-0 bottom-1/4 h-[200px] w-[200px] sm:h-[250px] sm:w-[250px] translate-x-1/3 rounded-full bg-primary/8 blur-[80px]" />
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--background)_70%)] opacity-60" />
      </div>

      <div className="container px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl"
        >
          {/* Premium card wrapper */}
          <div className="relative rounded-3xl border border-border/40 bg-gradient-to-b from-card/95 to-card/80 p-8 sm:p-10 md:p-12 lg:p-16 backdrop-blur-xl shadow-2xl shadow-primary/5">
            {/* Inner glow effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            
            <div className="relative text-center">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mb-6 sm:mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/25 bg-gradient-to-r from-primary/15 via-primary/8 to-primary/15 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-medium text-primary shadow-[0_0_25px_-8px] shadow-primary/25"
              >
                <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                <span>{t("cta.badge")}</span>
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-70" aria-hidden="true" />
              </motion.div>

              {/* Heading */}
              <motion.h2
                id="cta-heading"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="mb-4 sm:mb-6 text-balance text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight"
              >
                {t("cta.title")}{" "}
                <span className="relative inline-block">
                  <span className="text-gradient-primary">{t("cta.titleHighlight")}</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0" />
                </span>
              </motion.h2>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="mx-auto mb-8 sm:mb-10 max-w-2xl text-pretty text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed"
              >
                {t("cta.description")}
              </motion.p>

              {/* Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
              >
                <Button 
                  size="xl" 
                  variant="glow"
                  className="w-full sm:w-auto min-w-[200px] gap-2.5 font-semibold" 
                  asChild
                >
                  <Link href="/auth/sign-up">
                    {t("cta.button")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button 
                  size="xl" 
                  variant="outline" 
                  className="w-full sm:w-auto min-w-[160px] backdrop-blur-sm" 
                  asChild
                >
                  <Link href="/auth/login">{t("cta.signIn")}</Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
