"use client"

import { useEffect, useState, useRef, useCallback, memo } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Play, Clock, CheckCircle2 } from "lucide-react"

interface GoogleRewardedAdsProps {
  className?: string
  onAllAdsComplete?: () => void
  position?: "top" | "middle" | "bottom"
  lazyLoad?: boolean
}

interface AdSlot {
  id: number
  status: "pending" | "playing" | "completed"
  timeRemaining: number
  startedAt: number | null
}

const AD_DURATION = 60 // 60 seconds per ad
const TOTAL_ADS = 3

// Memoized ad slot component
const GoogleAdSlot = memo(function GoogleAdSlot({ slot }: { slot: AdSlot }) {
  const progress = ((AD_DURATION - slot.timeRemaining) / AD_DURATION) * 100

  return (
    <div className={cn(
      "relative rounded-lg border p-3 transition-all duration-300",
      slot.status === "completed" && "bg-green-500/5 border-green-500/30",
      slot.status === "playing" && "bg-red-500/5 border-red-500/30 animate-pulse",
      slot.status === "pending" && "bg-muted/30"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">Ad #{slot.id}</span>
        {slot.status === "completed" ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : slot.status === "playing" ? (
          <div className="flex items-center gap-1 text-red-500">
            <Clock className="h-3 w-3 animate-spin" />
            <span className="text-xs font-mono">{slot.timeRemaining}s</span>
          </div>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Waiting</Badge>
        )}
      </div>

      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full transition-all duration-1000",
            slot.status === "completed" && "bg-green-500",
            slot.status === "playing" && "bg-red-500",
            slot.status === "pending" && "bg-muted-foreground/20"
          )}
          style={{ width: `${slot.status === "completed" ? 100 : progress}%` }}
        />
      </div>
    </div>
  )
})

// Skeleton for lazy loading
const AdsSkeleton = memo(function AdsSkeleton() {
  return (
    <div className="rounded-xl border bg-muted/20 p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-muted" />
          <div className="space-y-1">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        </div>
        <div className="h-6 w-20 bg-muted rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
})

export const GoogleRewardedAds = memo(function GoogleRewardedAds({ 
  className, 
  onAllAdsComplete,
  position = "middle",
  lazyLoad = true,
}: GoogleRewardedAdsProps) {
  const [adSlots, setAdSlots] = useState<AdSlot[]>([
    { id: 1, status: "pending", timeRemaining: AD_DURATION, startedAt: null },
    { id: 2, status: "pending", timeRemaining: AD_DURATION, startedAt: null },
    { id: 3, status: "pending", timeRemaining: AD_DURATION, startedAt: null },
  ])
  const [isVisible, setIsVisible] = useState(!lazyLoad)
  const [shouldRender, setShouldRender] = useState(!lazyLoad)
  const [userTimeOnPage, setUserTimeOnPage] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pageTimeRef = useRef<NodeJS.Timeout | null>(null)

  // Lazy load with Intersection Observer
  useEffect(() => {
    if (!lazyLoad || isVisible) return
    
    const element = containerRef.current
    if (!element) return

    // Check if already in viewport
    const rect = element.getBoundingClientRect()
    if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
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
      { 
        rootMargin: "200px",
        threshold: 0.01 
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [lazyLoad, isVisible])

  // Delayed render after visible
  useEffect(() => {
    if (!isVisible || shouldRender) return

    // Use requestIdleCallback for non-blocking render
    if ("requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(() => setShouldRender(true), { timeout: 1000 })
      return () => {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId)
      }
    }

    const timer = setTimeout(() => setShouldRender(true), 100)
    return () => clearTimeout(timer)
  }, [isVisible, shouldRender])

  // Track user time on page
  useEffect(() => {
    if (!shouldRender) return

    pageTimeRef.current = setInterval(() => {
      setUserTimeOnPage(prev => prev + 1)
    }, 1000)

    return () => {
      if (pageTimeRef.current) clearInterval(pageTimeRef.current)
    }
  }, [shouldRender])

  // Start ads when visible and user has been on page
  useEffect(() => {
    if (!isVisible || !shouldRender) return

    const pendingAd = adSlots.find(ad => ad.status === "pending")
    if (pendingAd && userTimeOnPage >= (pendingAd.id - 1) * 10) {
      setAdSlots(prev => prev.map(ad => 
        ad.id === pendingAd.id 
          ? { ...ad, status: "playing" as const, startedAt: Date.now() }
          : ad
      ))
    }
  }, [isVisible, shouldRender, userTimeOnPage, adSlots])

  // Handle ad countdown
  useEffect(() => {
    const playingAd = adSlots.find(ad => ad.status === "playing")
    if (!playingAd || !isVisible || !shouldRender) return

    timerRef.current = setInterval(() => {
      setAdSlots(prev => prev.map(ad => {
        if (ad.status !== "playing") return ad
        
        const newTime = ad.timeRemaining - 1
        if (newTime <= 0) {
          return { ...ad, status: "completed" as const, timeRemaining: 0 }
        }
        return { ...ad, timeRemaining: newTime }
      }))
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [adSlots, isVisible, shouldRender])

  // Check if all ads completed
  useEffect(() => {
    const allCompleted = adSlots.every(ad => ad.status === "completed")
    if (allCompleted && onAllAdsComplete) {
      onAllAdsComplete()
    }
  }, [adSlots, onAllAdsComplete])

  const completedCount = adSlots.filter(ad => ad.status === "completed").length
  const totalProgress = (completedCount / TOTAL_ADS) * 100

  // Show skeleton while loading
  if (!shouldRender) {
    return (
      <div ref={containerRef} className={className}>
        <AdsSkeleton />
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-xl border bg-gradient-to-br from-background via-background to-muted/30 p-4 sm:p-6",
        "shadow-sm overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Play className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Google Rewarded Ads</h3>
            <p className="text-xs text-muted-foreground">
              Watch to support the platform
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{TOTAL_ADS} Complete
        </Badge>
      </div>

      {/* Ad Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {adSlots.map((slot) => (
          <GoogleAdSlot key={slot.id} slot={slot} />
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Overall Progress</span>
          <span>{Math.round(totalProgress)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-500"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>

      {/* Google AdSense Slots - Static, no refresh */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div 
            key={i}
            className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center border border-dashed border-muted-foreground/20"
            data-ad-client="ca-pub-XXXXXXXXXX"
            data-ad-slot={`google-rewarded-${position}-${i}`}
            data-ad-format="auto"
          >
            <span className="text-xs text-muted-foreground">
              Google Ad {i}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

export default GoogleRewardedAds
