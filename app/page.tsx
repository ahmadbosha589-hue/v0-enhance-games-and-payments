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
import { WithdrawalTickerMarquee } from "@/components/shared/withdrawal-ticker-marquee"
import { SkipLink } from "@/components/ui/skip-link"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/language-selector"
import { Menu, Loader2 } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/lib/i18n/language-context"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"

function HomePageContent() {
  const { t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const searchParams = useSearchParams()

  // Check if user just signed out - skip auth check entirely
  const justSignedOut = searchParams.get("signedOut")

  // Check if user is already logged in and redirect to dashboard
  useEffect(() => {
    // If user just signed out, don't check auth - just show the page
    if (justSignedOut) {
      // Clear the signedOut param from URL without refresh
      window.history.replaceState({}, "", "/")
      setIsCheckingAuth(false)
      return
    }

    const checkAuth = async () => {
      const supabase = createClient()
      if (!supabase) {
        setIsCheckingAuth(false)
        return
      }

      try {
        // Clear orphaned lock first
        await clearOrphanedAuthLock()

        // Use getUser which validates against server - getSession can be stale
        const { data: { user }, error } = await supabase.auth.getUser()

        // If there's an error or no user, they're not logged in
        if (error || !user) {
          setIsCheckingAuth(false)
          return
        }

        // User is authenticated, redirect to dashboard
        console.log("[Landing] User authenticated, redirecting to dashboard")
        window.location.href = "/dashboard"
      } catch (err) {
        console.warn("[Landing] Auth check failed:", err)
        setIsCheckingAuth(false)
      }
    }

    checkAuth()

    // Also listen for auth changes (in case OAuth callback just fired)
    const supabase = createClient()
    if (!supabase) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only redirect on explicit sign in, not cached sessions
      if (event === "SIGNED_IN" && session?.user && !justSignedOut) {
        console.log("[Landing] Auth state changed to SIGNED_IN, redirecting")
        window.location.href = "/dashboard"
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [justSignedOut])

  // Show loading while checking auth to prevent flash
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

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
        <section className="py-6 sm:py-10 border-y border-border/50 bg-muted/20">
          <div className="container px-4 sm:px-6">
            <WithdrawalTickerMarquee variant="landing" speed="normal" showHeader={true} />
          </div>
        </section>
        <StatsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <FAQSection />
        <CTASection />
      </main>

      {/* Footer */}
      <Footer />
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
