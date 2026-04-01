"use client"

import { Suspense, lazy } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// Lazy load ad components for performance
const GoogleRewardedAds = lazy(() => 
  import("./google-rewarded-ads").then(m => ({ default: m.GoogleRewardedAds }))
)
const MultiNetworkAds = lazy(() => 
  import("./multi-network-ads").then(m => ({ default: m.MultiNetworkAds }))
)

interface PageAdsWrapperProps {
  children: React.ReactNode
  className?: string
  showHeaderAds?: boolean
  showFooterAds?: boolean
  showSidebarAds?: boolean
  pageName?: string
}

/**
 * PageAdsWrapper - Wraps page content with Google Rewarded Ads (3x 60s static)
 * and 11 other ad networks (auto-refreshing) properly separated per Google policies.
 * 
 * Google Ads are positioned separately from other networks.
 * Other networks auto-refresh on completion, except AdsKeeper which only refreshes on page load.
 */
export function PageAdsWrapper({
  children,
  className,
  showHeaderAds = true,
  showFooterAds = true,
  showSidebarAds = true,
  pageName = "page"
}: PageAdsWrapperProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Top Section: Google Rewarded Ads (Static, 60s each) */}
      {showHeaderAds && (
        <div className="mb-4 sm:mb-6">
          <Suspense fallback={<AdSkeleton type="google" />}>
            <GoogleRewardedAds 
              position="top" 
              className="animate-in fade-in duration-500"
            />
          </Suspense>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Sidebar Ads (Desktop only) - Other 11 Networks */}
        {showSidebarAds && (
          <aside className="hidden lg:block w-[300px] shrink-0 space-y-4">
            <Suspense fallback={<AdSkeleton type="sidebar" />}>
              <MultiNetworkAds 
                position="sidebar"
                layout="stack"
                showLabels={false}
                className="sticky top-4"
              />
            </Suspense>
          </aside>
        )}
      </div>

      {/* Spacer to keep Google Ads separate from other networks per policy */}
      <div className="h-8 sm:h-12" aria-hidden="true" />

      {/* Bottom Section: Other 11 Ad Networks (Auto-refreshing) */}
      {showFooterAds && (
        <div className="mt-4 sm:mt-6 space-y-4">
          {/* Other networks grid */}
          <Suspense fallback={<AdSkeleton type="network" />}>
            <MultiNetworkAds 
              position="footer"
              layout="grid"
              showLabels={false}
              className="animate-in fade-in duration-700"
            />
          </Suspense>

          {/* Bottom Google Rewarded Ads - well separated from other networks */}
          <div className="mt-8 sm:mt-12">
            <Suspense fallback={<AdSkeleton type="google" />}>
              <GoogleRewardedAds 
                position="bottom"
                className="animate-in fade-in duration-500 delay-200"
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sticky Ad Bar */}
      <MobileBottomAds />
    </div>
  )
}

/**
 * Mobile sticky ad bar at bottom of screen
 */
function MobileBottomAds() {
  return (
    <div className="fixed bottom-0 left-0 right-0 lg:hidden z-40 safe-area-bottom">
      <div className="bg-background/95 backdrop-blur-sm border-t p-2">
        <div className="flex items-center justify-center gap-2 overflow-x-auto">
          {/* Small banner slots for mobile */}
          <div 
            className="shrink-0 w-[320px] h-[50px] bg-muted/50 rounded flex items-center justify-center"
            data-ad-slot="mobile-bottom-banner"
          >
            <span className="text-[10px] text-muted-foreground">Ad</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Ad loading skeleton
 */
function AdSkeleton({ type }: { type: "google" | "network" | "sidebar" }) {
  if (type === "google") {
    return (
      <div className="rounded-xl border bg-muted/20 p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (type === "sidebar") {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-[250px] rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
          <Skeleton key={i} className="aspect-video rounded-md" />
        ))}
      </div>
    </div>
  )
}

/**
 * Inline ad component for embedding within content
 */
export function InlineAds({ className }: { className?: string }) {
  return (
    <div className={cn("my-4 sm:my-6", className)}>
      <Suspense fallback={<Skeleton className="h-[90px] rounded-lg" />}>
        <MultiNetworkAds 
          position="content"
          layout="inline"
          showLabels={false}
        />
      </Suspense>
    </div>
  )
}

/**
 * Content break ads - for between sections
 */
export function ContentBreakAds({ className }: { className?: string }) {
  return (
    <div className={cn("py-4 sm:py-6 border-y border-dashed border-muted-foreground/10", className)}>
      <div className="flex items-center justify-center gap-4 overflow-x-auto pb-2">
        <div 
          className="shrink-0 w-[728px] max-w-full h-[90px] bg-muted/30 rounded-lg flex items-center justify-center"
          data-ad-slot="content-break-leaderboard"
        >
          <span className="text-xs text-muted-foreground">Ad</span>
        </div>
      </div>
    </div>
  )
}
