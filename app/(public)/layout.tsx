"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { LogoFull } from "@/components/icons/logo"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/landing/footer"
import { LanguageSelector } from "@/components/language-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { AAdsStickyUnit } from "@/components/ads/aads-sticky-unit"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/30 bg-background/85 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 sm:h-16 lg:h-18 items-center justify-between px-4">
          <Link href="/" className="flex-shrink-0 transition-opacity hover:opacity-80">
            <LogoFull size="sm" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            <Link
              href="/#features"
              className="relative px-3 lg:px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
            >
              <span className="relative z-10">{t("nav.features", "Features")}</span>
              <span className="absolute inset-0 rounded-lg bg-accent/0 group-hover:bg-accent/50 transition-colors duration-300" />
            </Link>
            <Link
              href="/#how-it-works"
              className="relative px-3 lg:px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
            >
              <span className="relative z-10">{t("nav.howItWorks", "How It Works")}</span>
              <span className="absolute inset-0 rounded-lg bg-accent/0 group-hover:bg-accent/50 transition-colors duration-300" />
            </Link>
            <Link
              href="/blog"
              className="relative px-3 lg:px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
            >
              <span className="relative z-10">{t("nav.blog", "Blog")}</span>
              <span className="absolute inset-0 rounded-lg bg-accent/0 group-hover:bg-accent/50 transition-colors duration-300" />
            </Link>
            <Link
              href="/#faq"
              className="relative px-3 lg:px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
            >
              <span className="relative z-10">{t("nav.faq", "FAQ")}</span>
              <span className="absolute inset-0 rounded-lg bg-accent/0 group-hover:bg-accent/50 transition-colors duration-300" />
            </Link>
          </nav>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-1.5 lg:gap-2">
            {mounted && (
              <>
                <LanguageSelector />
                <ThemeToggle />
              </>
            )}
            <Button variant="ghost" size="sm" className="font-medium" asChild>
              <Link href="/auth/login">{t("nav.signIn", "Sign In")}</Link>
            </Button>
            <Button size="sm" className="font-semibold shadow-sm" asChild>
              <Link href="/auth/sign-up">{t("nav.getStarted", "Get Started")}</Link>
            </Button>
          </div>

          {/* Mobile Menu */}
          <div className="flex md:hidden items-center gap-2">
            {mounted && (
              <>
                <LanguageSelector />
                <ThemeToggle />
              </>
            )}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[340px] p-0 border-l-border/40">
                <div className="flex flex-col h-full bg-gradient-to-b from-background to-background/95">
                  <div className="p-6 border-b border-border/40">
                    <LogoFull size="sm" />
                  </div>
                  <nav className="flex-1 p-6">
                    <div className="space-y-1">
                      <Link
                        href="/#features"
                        className="flex items-center px-4 py-3 rounded-xl text-base font-medium text-foreground hover:text-primary hover:bg-accent/50 transition-all duration-200"
                        onClick={() => setIsOpen(false)}
                      >
                        {t("nav.features", "Features")}
                      </Link>
                      <Link
                        href="/#how-it-works"
                        className="flex items-center px-4 py-3 rounded-xl text-base font-medium text-foreground hover:text-primary hover:bg-accent/50 transition-all duration-200"
                        onClick={() => setIsOpen(false)}
                      >
                        {t("nav.howItWorks", "How It Works")}
                      </Link>
                      <Link
                        href="/blog"
                        className="flex items-center px-4 py-3 rounded-xl text-base font-medium text-foreground hover:text-primary hover:bg-accent/50 transition-all duration-200"
                        onClick={() => setIsOpen(false)}
                      >
                        {t("nav.blog", "Blog")}
                      </Link>
                      <Link
                        href="/#faq"
                        className="flex items-center px-4 py-3 rounded-xl text-base font-medium text-foreground hover:text-primary hover:bg-accent/50 transition-all duration-200"
                        onClick={() => setIsOpen(false)}
                      >
                        {t("nav.faq", "FAQ")}
                      </Link>
                    </div>
                  </nav>
                  <div className="p-6 border-t border-border/40 space-y-3 bg-muted/30">
                    <Button variant="outline" className="w-full h-12 text-base font-medium" asChild>
                      <Link href="/auth/login" onClick={() => setIsOpen(false)}>
                        {t("nav.signIn", "Sign In")}
                      </Link>
                    </Button>
                    <Button className="w-full h-12 text-base font-semibold" asChild>
                      <Link href="/auth/sign-up" onClick={() => setIsOpen(false)}>
                        {t("nav.getStarted", "Get Started")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <Footer />

      {/* c.cx.ua partner banner (zone 32) - dismissible sticky footer ad.
          Mounted only on non-admin public surfaces. The zone 31 same-tab
          popup/click-under redirect that used to load here was removed
          site-wide (see PublicAdsLayer) because it silently redirected
          visitors off the page, which violates AdSense's prohibition on
          publisher pages triggering unwanted redirects. */}
      <PublicAdsLayer />

      {/* A-ADS adaptive banner unit 2457981 on every public page. */}
      <AAdsAdaptiveUnit />
      {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
      <AAdsStickyUnit />
    </div>
  )
}
