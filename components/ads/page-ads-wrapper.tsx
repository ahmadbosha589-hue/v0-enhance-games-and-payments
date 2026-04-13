"use client"

import { Suspense, lazy, memo, useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// Lazy load ad components for performance - only load when needed
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

// Memoized skeletons to prevent re-renders
const GoogleAdSkeleton = memo(function GoogleAdSkeleton() {
  return (
    <div className="rounded-xl border bg-muted/10 p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
})

const NetworkAdSkeleton = memo(function NetworkAdSkeleton() {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-video bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  )
})

const SidebarSkeleton = memo(function SidebarSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div key={i} className="h-[200px] bg-muted/50 rounded-lg animate-pulse" />
      ))}
    </div>
  )
})

/**
 * LazyAdSection - Only renders ad content when visible and after page loads
 * Has a timeout to prevent infinite loading states
 */
const LazyAdSection = memo(function LazyAdSection({
  children,
  fallback,
  rootMargin = "300px",
  delay = 0,
  timeout = 5000,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
  rootMargin?: string
  delay?: number
  timeout?: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Check if already in viewport
    const rect = element.getBoundingClientRect()
    if (rect.top < window.innerHeight + 300) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [rootMargin])

  useEffect(() => {
    if (!isVisible) return

    // Use requestIdleCallback for non-blocking render
    if ("requestIdleCallback" in window && delay > 0) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(() => {
          setTimeout(() => setShouldRender(true), delay)
        }, { timeout: 3000 })
      return () => {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId)
      }
    }

    const timer = setTimeout(() => setShouldRender(true), delay)
    return () => clearTimeout(timer)
  }, [isVisible, delay])

  // Timeout fallback - if component takes too long, just render nothing
  useEffect(() => {
    if (shouldRender) return

    const timeoutTimer = setTimeout(() => {
      setTimedOut(true)
      setShouldRender(true)
    }, timeout)

    return () => clearTimeout(timeoutTimer)
  }, [shouldRender, timeout])

  // If timed out, render empty div instead of skeleton
  if (timedOut) {
    return <div ref={ref} />
  }

  return (
    <div ref={ref}>
      {shouldRender ? children : fallback}
    </div>
  )
})

/**
 * PageAdsWrapper - Wraps page content with Google Rewarded Ads (3x 60s static)
 * and 11 other ad networks (auto-refreshing) properly separated per Google policies.
 * 
 * All ads are lazy loaded and don't block page rendering.
 */
export const PageAdsWrapper = memo(function PageAdsWrapper({
  children,
  className,
  showHeaderAds = true,
  showFooterAds = true,
  showSidebarAds = true,
  pageName = "page"
}: PageAdsWrapperProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Top Section: Google Rewarded Ads (Static, 60s each) - Lazy loaded */}
      {showHeaderAds && (
        <div className="mb-4 sm:mb-6">
          <LazyAdSection
            fallback={<GoogleAdSkeleton />}
            rootMargin="100px"
            delay={0}
            timeout={3000}
          >
            <Suspense fallback={<GoogleAdSkeleton />}>
              <GoogleRewardedAds
                position="top"
                lazyLoad={true}
                className="animate-in fade-in duration-500"
              />
            </Suspense>
          </LazyAdSection>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Main Content - Always rendered immediately */}
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Sidebar Ads (Desktop only) - Lazy loaded with low priority */}
        {showSidebarAds && (
          <aside className="hidden lg:block w-[300px] shrink-0 space-y-4">
            <LazyAdSection
              fallback={<SidebarSkeleton />}
              rootMargin="200px"
              delay={0}
              timeout={3000}
            >
              <Suspense fallback={<SidebarSkeleton />}>
                <MultiNetworkAds
                  position="sidebar"
                  layout="stack"
                  showLabels={false}
                  lazyLoad={true}
                  priority="low"
                  className="sticky top-4"
                />
              </Suspense>
            </LazyAdSection>
          </aside>
        )}
      </div>

      {/* Spacer to keep Google Ads separate from other networks per policy */}
      <div className="h-8 sm:h-12" aria-hidden="true" />

      {/* Bottom Section: Other 11 Ad Networks (Auto-refreshing) - Lazy loaded */}
      {showFooterAds && (
        <div className="mt-4 sm:mt-6 space-y-4">
          {/* Other networks grid - Medium priority */}
          <LazyAdSection
            fallback={<NetworkAdSkeleton />}
            rootMargin="400px"
            delay={0}
            timeout={3000}
          >
            <Suspense fallback={<NetworkAdSkeleton />}>
              <MultiNetworkAds
                position="footer"
                layout="grid"
                showLabels={false}
                lazyLoad={true}
                priority="medium"
                className="animate-in fade-in duration-700"
              />
            </Suspense>
          </LazyAdSection>

          {/* Bottom Google Rewarded Ads - Load in parallel */}
          <div className="mt-8 sm:mt-12">
            <LazyAdSection
              fallback={<GoogleAdSkeleton />}
              rootMargin="500px"
              delay={0}
              timeout={3000}
            >
              <Suspense fallback={<GoogleAdSkeleton />}>
                <GoogleRewardedAds
                  position="bottom"
                  lazyLoad={true}
                  className="animate-in fade-in duration-500 delay-200"
                />
              </Suspense>
            </LazyAdSection>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sticky Ad Bar - Lightweight */}
      <MobileBottomAds />
    </div>
  )
})

/**
 * Mobile sticky ad bar at bottom of screen - Lightweight, no lazy loading needed
 */
const MobileBottomAds = memo(function MobileBottomAds() {
  const [mounted, setMounted] = useState(false)

  // Only mount after hydration to prevent layout shift
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  if (!mounted) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 lg:hidden z-40 safe-area-bottom">
      <div className="bg-background/95 backdrop-blur-sm border-t p-2">
        <div className="flex items-center justify-center gap-2 overflow-x-auto">
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
})

/**
 * Inline ad component for embedding within content - Lazy loaded
 */
export const InlineAds = memo(function InlineAds({ className }: { className?: string }) {
  return (
    <div className={cn("my-4 sm:my-6", className)}>
      <LazyAdSection
        fallback={<div className="h-[90px] bg-muted rounded-lg animate-pulse" />}
        rootMargin="200px"
        delay={0}
      >
        <Suspense fallback={<div className="h-[90px] bg-muted rounded-lg animate-pulse" />}>
          <MultiNetworkAds
            position="content"
            layout="inline"
            showLabels={false}
            lazyLoad={true}
            priority="medium"
          />
        </Suspense>
      </LazyAdSection>
    </div>
  )
})

/**
 * Content break ads - for between sections - Lazy loaded
 */
export const ContentBreakAds = memo(function ContentBreakAds({ className }: { className?: string }) {
  return (
    <div className={cn("py-4 sm:py-6 border-y border-dashed border-muted-foreground/10", className)}>
      <LazyAdSection
        fallback={<div className="h-[90px] max-w-[728px] mx-auto bg-muted rounded-lg animate-pulse" />}
        rootMargin="300px"
        delay={0}
      >
        <div className="flex items-center justify-center gap-4 overflow-x-auto pb-2">
          <div
            className="shrink-0 w-[728px] max-w-full h-[90px] bg-muted/30 rounded-lg flex items-center justify-center"
            data-ad-slot="content-break-leaderboard"
          >
            <span className="text-xs text-muted-foreground">Ad</span>
          </div>
        </div>
      </LazyAdSection>
    </div>
  )
})

export default PageAdsWrapper
