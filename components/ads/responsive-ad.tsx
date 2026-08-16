"use client"

import { useEffect, useState, Suspense, lazy, memo } from "react"
import { AdSlot } from "./ad-slot"
import { cn } from "@/lib/utils"

// Lazy load MultiNetworkAds for better performance
const MultiNetworkAds = lazy(() =>
  import("./multi-network-ads").then(m => ({ default: m.MultiNetworkAds }))
)

interface ResponsiveAdProps {
  position: "sidebar" | "header" | "content" | "footer" | "between-content"
  className?: string
  mobileHidden?: boolean
  desktopHidden?: boolean
  showMultiNetwork?: boolean
}

// Skeleton for multi-network ads
const MultiNetworkSkeleton = memo(function MultiNetworkSkeleton() {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 sm:p-4 animate-pulse">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-video bg-muted/40 rounded-md" />
        ))}
      </div>
    </div>
  )
})

export function ResponsiveAd({
  position,
  className,
  mobileHidden = false,
  desktopHidden = false,
  showMultiNetwork = true
}: ResponsiveAdProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  if ((isMobile && mobileHidden) || (!isMobile && desktopHidden)) {
    return null
  }

  // Map position to layout for multi-network ads
  const getMultiNetworkLayout = () => {
    switch (position) {
      case "sidebar":
        return "stack"
      case "header":
      case "footer":
        return "grid"
      default:
        return "inline"
    }
  }

  return (
    <div
      className={cn(
        "w-full overflow-hidden space-y-4",
        mobileHidden && "hidden md:block",
        desktopHidden && "block md:hidden",
        className,
      )}
    >
      {/* Google AdSense slot */}
      <AdSlot position={position} size={isMobile ? "mobile" : undefined} />

      {/* 11 Other Ad Networks - separated per Google policy */}
      {showMultiNetwork && (
        <div className="mt-4">
          <Suspense fallback={<MultiNetworkSkeleton />}>
            <MultiNetworkAds
              position={position === "between-content" ? "content" : position}
              layout={getMultiNetworkLayout()}
              showLabels={false}
              lazyLoad={true}
              priority={position === "header" ? "high" : "medium"}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
