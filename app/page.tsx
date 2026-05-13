"use client"

import Link from "next/link"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogoFull } from "@/components/icons/logo"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { StatsSection } from "@/components/landing/stats-section"
import { FAQSection } from "@/components/landing/faq-section"
import { CTASection } from "@/components/landing/cta-section"
import { Footer } from "@/components/landing/footer"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"
import { WithdrawalTickerMarquee } from "@/components/shared/withdrawal-ticker-marquee"
import { SkipLink } from "@/components/ui/skip-link"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/language-selector"
import { ResponsiveAd } from "@/components/ads/responsive-ad"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { Menu, Loader2 } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/lib/i18n/language-context"
import { createClient } from "@/lib/supabase/client"

function HomePageContent() {
  const { t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const searchParams = useSearchParams()

  // Check if user just signed out — skip auth check entirely
  const justSignedOut = searchParams.get("signedOut")

  // Fire-and-forget auth check: render the landing page IMMEDIATELY (so
  // first paint is fast for new visitors, which is the majority case) and
  // only redirect to /dashboard in the background if a logged-in session
  // is detected. We previously gated the whole page on this check, which
  // made the landing feel sluggish for everyone.
  useEffect(() => {
    if (justSignedOut) {
      // Clear the signedOut param from URL without refresh
      window.history.replaceState({}, "", "/")
      return
    }

    let cancelled = false

    const supabase = createClient()
    if (!supabase) return

    // Fast localStorage read — instant, no network.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled || !session?.user) return
        window.location.replace("/dashboard")
      })
      .catch(() => {
        /* not logged in or error — stay on landing */
      })

    // React to OAuth callback completion (SIGNED_IN only — not token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event !== "SIGNED_IN") return
      if (!session?.user) return
      if (justSignedOut) return
      window.location.replace("/dashboard")
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [justSignedOut])

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />

      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-xl supports-backdrop-filter:bg-background/60 safe-top">
        <nav className="container flex h-14 sm:h-16 items-center justify-between" aria-label="Main navigation">
          <Link href="/" aria-label="CryptoFaucet Home" className="flex-shrink-0">
            <LogoFull size="sm" />
          </Link>

          {/* Desktop navigation */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-6">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-2 py-1"
            >
              {t("nav.features")}
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-2 py-1"
            >
              {t("nav.howItWorks")}
            </Link>
            <Link
              href="#faq"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-2 py-1"
            >
              {t("nav.faq")}
            </Link>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex items-center gap-1">
              <LanguageSelector />
              <ThemeToggle />
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex text-xs sm:text-sm h-9">
              <Link href="/auth/login">{t("nav.signIn")}</Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex text-xs sm:text-sm h-9">
              <Link href="/auth/sign-up">{t("nav.getStarted")}</Link>
            </Button>

            {/* Mobile menu - Use controlled state */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" aria-label={t("nav.menu")} className="h-10 w-10">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[320px] p-0">
                <SheetHeader className="p-4 pb-2 border-b">
                  <SheetTitle className="text-left">
                    <LogoFull size="sm" />
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col h-[calc(100%-65px)]">
                  <div className="flex items-center justify-center gap-4 p-4 border-b sm:hidden">
                    <LanguageSelector />
                    <ThemeToggle />
                  </div>

                  <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto" aria-label="Mobile navigation">
                    <Link
                      href="#features"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center py-3 px-4 rounded-lg text-base font-medium transition-colors hover:bg-accent active:bg-accent/80 touch-target"
                    >
                      {t("nav.features")}
                    </Link>
                    <Link
                      href="#how-it-works"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center py-3 px-4 rounded-lg text-base font-medium transition-colors hover:bg-accent active:bg-accent/80 touch-target"
                    >
                      {t("nav.howItWorks")}
                    </Link>
                    <Link
                      href="#faq"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center py-3 px-4 rounded-lg text-base font-medium transition-colors hover:bg-accent active:bg-accent/80 touch-target"
                    >
                      {t("nav.faq")}
                    </Link>
                    <div className="h-px bg-border my-3" />
                    <Link
                      href="/auth/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center py-3 px-4 rounded-lg text-base font-medium transition-colors hover:bg-accent active:bg-accent/80 touch-target"
                    >
                      {t("nav.signIn")}
                    </Link>
                  </nav>

                  <div className="p-4 border-t mt-auto safe-bottom">
                    <Button asChild className="w-full h-12 text-base" onClick={() => setMobileMenuOpen(false)}>
                      <Link href="/auth/sign-up">{t("nav.getStarted")}</Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1">
        <HeroSection />

        {/* Top Ad Banner — slim 728×90 leaderboard. No 12-network grid here:
            it inflated the landing page. The full partner grid is rendered
            once near the footer instead. */}
        <section className="py-3 sm:py-4 bg-muted/10">
          <div className="container px-4 sm:px-6 flex justify-center">
            <ResponsiveAd position="header" showMultiNetwork={false} />
          </div>
        </section>

        <section className="py-6 sm:py-10 border-y border-border/50 bg-muted/20">
          <div className="container px-4 sm:px-6">
            <WithdrawalTickerMarquee variant="landing" speed="normal" showHeader={true} />
          </div>
        </section>
        <StatsSection />

        {/* Mid-Page Ad — slim 468×60 banner only. Keeps the page light. */}
        <section className="py-3 sm:py-4 bg-gradient-to-r from-transparent via-muted/20 to-transparent">
          <div className="container px-4 sm:px-6 flex justify-center">
            <ResponsiveAd position="between-content" showMultiNetwork={false} />
          </div>
        </section>

        <FeaturesSection />
        <HowItWorksSection />

        {/* Content Break Ad — slim banner only */}
        <section className="py-3 sm:py-4">
          <div className="container px-4 sm:px-6 flex justify-center">
            <ResponsiveAd position="content" showMultiNetwork={false} />
          </div>
        </section>

        <FAQSection />

        {/* Footer Ad — slim banner only, multi-network grid lives below */}
        <section className="py-3 sm:py-4 bg-muted/10">
          <div className="container px-4 sm:px-6 flex justify-center">
            <ResponsiveAd position="footer" showMultiNetwork={false} />
          </div>
        </section>

        {/* Consolidated 11-network + c.cx.ua partner grid — rendered ONCE on
            the landing page (in compact density) instead of repeated under
            every section. This keeps the page light while still giving each
            partner network an impression for every visitor. */}
        <section className="py-6 sm:py-8 border-y border-border/40 bg-muted/5">
          <div className="container px-4 sm:px-6">
            <p className="text-center text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mb-3">
              Sponsored Partners
            </p>
            <MultiNetworkAds
              position="content"
              layout="grid"
              showLabels={false}
              density="compact"
              priority="low"
            />
          </div>
        </section>

        <CTASection />
      </main>

      {/* Footer */}
      <Footer />

      {/* c.cx.ua partner banner (zone 32) + popup redirect (zone 31).
          Mounted on the landing page so first-time visitors see the partner
          banner and (at most once per 24h) the popup redirect. */}
      <PublicAdsLayer />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  )
}
