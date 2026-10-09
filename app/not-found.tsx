"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LogoFull } from "@/components/icons/logo"
import { Home, ArrowLeft, Search, HelpCircle } from "lucide-react"
import { PublicAdsLayer } from "@/components/ads/public-ads-layer"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { AAdsStickyUnit } from "@/components/ads/aads-sticky-unit"
import { AdsterraUnits } from "@/components/ads/adsterra-units"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md text-center">
        <Link href="/" aria-label="Go to homepage">
          <LogoFull size="lg" className="mx-auto mb-8" />
        </Link>

        <div className="relative mb-8">
          <h1 className="text-[120px] font-bold leading-none text-muted/20 sm:text-[150px]" aria-hidden="true">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-muted/50 p-6">
              <Search className="h-12 w-12 text-muted-foreground/50 sm:h-16 sm:w-16" aria-hidden="true" />
            </div>
          </div>
        </div>

        <h2 className="mb-2 text-2xl font-bold">Page Not Found</h2>
        <p className="mb-8 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved to a new location.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/" className="gap-2">
              <Home className="h-4 w-4" aria-hidden="true" />
              Go Home
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Go Back
          </Button>
        </div>

        <div className="mt-8 pt-8 border-t border-border/40">
          <p className="text-sm text-muted-foreground mb-3">Need help finding something?</p>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/help" className="gap-2">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              Visit Help Center
            </Link>
          </Button>
        </div>
      </div>

      {/* c.cx.ua floating banner — popup disabled on this error surface */}
      <PublicAdsLayer disablePopup />
      {/* A-ADS adaptive banner unit 2457981. */}
      <AAdsAdaptiveUnit />
      {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
      <AAdsStickyUnit />
      {/* Adsterra real placements (popunder on engaged surfaces only). */}
      <AdsterraUnits />
    </div>
  )
}
