"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, Zap, Shield, Users } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"
import { UserCountBadge } from "./user-count-badge"
import { TrustedUsersCount } from "./trusted-users-count"

export function HeroSection() {
  const { t } = useLanguage()

  return (
    <section className="relative overflow-hidden py-16 sm:py-20 md:py-28 lg:py-36 xl:py-40">
      {/* Premium multi-layer background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Primary radial glow */}
        <div className="absolute left-1/2 top-0 h-[400px] w-[400px] sm:h-[500px] sm:w-[500px] md:h-[700px] md:w-[700px] lg:h-[900px] lg:w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/12 blur-[120px]" />
        {/* Secondary accent glow */}
        <div className="absolute bottom-0 right-0 h-[250px] w-[250px] sm:h-[350px] sm:w-[350px] md:h-[450px] md:w-[450px] lg:h-[550px] lg:w-[550px] translate-x-1/4 translate-y-1/4 rounded-full bg-accent/12 blur-[100px]" />
        {/* Tertiary glow for depth */}
        <div className="absolute left-0 top-1/2 h-[200px] w-[200px] sm:h-[300px] sm:w-[300px] md:h-[400px] md:w-[400px] -translate-x-1/3 -translate-y-1/2 rounded-full bg-primary/8 blur-[80px]" />
        {/* Subtle animated grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] sm:bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black_30%,transparent_100%)]" />
        {/* Gradient noise texture for premium feel */}
        <div className="absolute inset-0 opacity-[0.015] [background-image:url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />
      </div>

      <div className="container px-4 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          {/* Badge with dynamic user count */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <UserCountBadge />
          </motion.div>

          {/* Headline with enhanced typography */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 sm:mb-8 text-balance text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.08]"
          >
            {t("hero.title")}{" "}
            <span className="relative inline-block">
              <span className="text-gradient-primary">{t("hero.titleHighlight")}</span>
              <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 blur-[1px]" />
            </span>{" "}
            {t("hero.titleEnd")}
          </motion.h1>

          {/* Description with better readability */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mb-10 sm:mb-12 max-w-2xl text-pretty text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed px-2"
          >
            {t("hero.description")}
          </motion.p>

          {/* Premium CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <Button 
              size="xl" 
              variant="glow"
              className="w-full sm:w-auto min-w-[200px] gap-2.5 text-sm sm:text-base font-semibold" 
              asChild
            >
              <Link href="/auth/sign-up">
                {t("hero.cta.start")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              size="xl"
              variant="outline"
              className="w-full sm:w-auto min-w-[180px] text-sm sm:text-base backdrop-blur-sm"
              asChild
            >
              <Link href="#how-it-works">{t("hero.cta.learn")}</Link>
            </Button>
          </motion.div>

          {/* Trust indicators with enhanced styling */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="mt-12 sm:mt-16 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-muted-foreground"
            role="list"
            aria-label="Platform trust indicators"
          >
            <div className="flex items-center gap-3 group" role="listitem">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 shadow-sm group-hover:shadow-primary/20 group-hover:border-primary/20 transition-all duration-300">
                <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="font-medium tracking-wide">{t("hero.trust.secure")}</span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden="true" />
            <div className="flex items-center gap-3 group" role="listitem">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 shadow-sm group-hover:shadow-primary/20 group-hover:border-primary/20 transition-all duration-300">
                <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="font-medium tracking-wide">{t("hero.trust.instant")}</span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden="true" />
            <div className="flex items-center gap-3 group" role="listitem">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 shadow-sm group-hover:shadow-primary/20 group-hover:border-primary/20 transition-all duration-300">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <TrustedUsersCount className="font-medium tracking-wide" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
