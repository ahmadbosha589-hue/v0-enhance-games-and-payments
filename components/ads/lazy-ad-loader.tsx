"use client"

import { useEffect, useRef, useState, useCallback, memo } from "react"
import { cn } from "@/lib/utils"

interface LazyAdLoaderProps {
  children: React.ReactNode
  className?: string
  placeholder?: React.ReactNode
  rootMargin?: string
  threshold?: number
  priority?: "high" | "medium" | "low"
  delayMs?: number
  onVisible?: () => void
  onLoad?: () => void
  minHeight?: number
}

// Optimized intersection observer with singleton pattern
const observerMap = new Map<string, IntersectionObserver>()

function getObserver(
  rootMargin: string,
  threshold: number,
  callback: (entry: IntersectionObserverEntry) => void
): IntersectionObserver {
  const key = `${rootMargin}-${threshold}`
  
  if (!observerMap.has(key)) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const cb = (entry.target as HTMLElement).dataset.observerCallback
          if (cb && entry.isIntersecting) {
            callback(entry)
          }
        })
      },
      { rootMargin, threshold }
    )
    observerMap.set(key, observer)
  }
  
  return observerMap.get(key)!
}

// Ad placeholder skeleton
const AdSkeleton = memo(function AdSkeleton({ 
  minHeight = 90,
  className 
}: { 
  minHeight?: number
  className?: string 
}) {
  return (
    <div 
      className={cn(
        "bg-muted/30 rounded-lg animate-pulse flex items-center justify-center",
        className
      )}
      style={{ minHeight }}
    >
      <div className="text-xs text-muted-foreground/50">Ad</div>
    </div>
  )
})

export const LazyAdLoader = memo(function LazyAdLoader({
  children,
  className,
  placeholder,
  rootMargin = "200px", // Start loading 200px before visible
  threshold = 0.01,
  priority = "medium",
  delayMs = 0,
  onVisible,
  onLoad,
  minHeight = 90,
}: LazyAdLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Determine delay based on priority
  const actualDelay = priority === "high" ? 0 : priority === "medium" ? delayMs || 100 : delayMs || 300

  const handleIntersection = useCallback((entry: IntersectionObserverEntry) => {
    if (entry.isIntersecting && !isVisible) {
      setIsVisible(true)
      onVisible?.()

      // Use requestIdleCallback for low priority ads
      if (priority === "low" && "requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(
            () => {
              setTimeout(() => {
                setShouldRender(true)
              }, actualDelay)
            },
            { timeout: 2000 }
          )
      } else {
        // Use setTimeout for medium/high priority
        setTimeout(() => {
          setShouldRender(true)
        }, actualDelay)
      }
    }
  }, [isVisible, onVisible, priority, actualDelay])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    // High priority ads render immediately
    if (priority === "high") {
      setIsVisible(true)
      setShouldRender(true)
      return
    }

    // Check if already in viewport on mount
    const rect = element.getBoundingClientRect()
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0

    if (isInViewport) {
      setIsVisible(true)
      setTimeout(() => setShouldRender(true), actualDelay)
      return
    }

    // Set up intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            handleIntersection(entry)
            observer.unobserve(element)
          }
        })
      },
      { rootMargin, threshold }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [rootMargin, threshold, priority, actualDelay, handleIntersection])

  // Notify when loaded
  useEffect(() => {
    if (shouldRender && !isLoaded) {
      // Give a small delay for the ad to actually render
      const timer = setTimeout(() => {
        setIsLoaded(true)
        onLoad?.()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [shouldRender, isLoaded, onLoad])

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{ minHeight: shouldRender ? undefined : minHeight }}
    >
      {shouldRender ? (
        children
      ) : (
        placeholder || <AdSkeleton minHeight={minHeight} />
      )}
    </div>
  )
})

// Hook for programmatic lazy loading
export function useLazyAd(options?: {
  rootMargin?: string
  threshold?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: options?.rootMargin || "200px",
        threshold: options?.threshold || 0.01,
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [options?.rootMargin, options?.threshold])

  return { ref, isVisible }
}

export default LazyAdLoader
