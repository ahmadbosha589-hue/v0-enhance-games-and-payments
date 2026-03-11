"use client"

import { useEffect, useState } from "react"
import { AdSlot } from "./ad-slot"
import { cn } from "@/lib/utils"

interface ResponsiveAdProps {
  position: "sidebar" | "header" | "content" | "footer" | "between-content"
  className?: string
  mobileHidden?: boolean
  desktopHidden?: boolean
}

export function ResponsiveAd({ position, className, mobileHidden = false, desktopHidden = false }: ResponsiveAdProps) {
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

  return (
    <div
      className={cn(
        "w-full overflow-hidden",
        mobileHidden && "hidden md:block",
        desktopHidden && "block md:hidden",
        className,
      )}
    >
      <AdSlot position={position} size={isMobile ? "mobile" : undefined} />
    </div>
  )
}
