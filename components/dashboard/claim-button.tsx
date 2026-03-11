"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import type { Profile } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { AlertCircle, Clock, Zap, ArrowRight } from "lucide-react"
import { formatCountdown } from "@/lib/utils/format"
import { CLAIM_CONFIG } from "@/lib/constants/config"
import { cn } from "@/lib/utils"

interface ClaimButtonProps {
  profile: Profile
  size?: "default" | "lg"
  showTimer?: boolean
  className?: string
}

export function ClaimButton({ profile, size = "default", showTimer = true, className }: ClaimButtonProps) {
  const [secondsUntilClaim, setSecondsUntilClaim] = useState(0)

  const calculateTimeUntilClaim = useCallback(() => {
    if (!profile.last_claim_at) return 0

    const lastClaim = new Date(profile.last_claim_at).getTime()
    const now = Date.now()
    const cooldownMs = CLAIM_CONFIG.cooldownSeconds * 1000
    const timeLeft = Math.max(0, cooldownMs - (now - lastClaim))

    return Math.ceil(timeLeft / 1000)
  }, [profile.last_claim_at])

  useEffect(() => {
    setSecondsUntilClaim(calculateTimeUntilClaim())

    const interval = setInterval(() => {
      const newSeconds = calculateTimeUntilClaim()
      setSecondsUntilClaim(newSeconds)
    }, 1000)

    return () => clearInterval(interval)
  }, [calculateTimeUntilClaim])

  const canClaim = secondsUntilClaim === 0 && profile.status === "active" && !profile.is_flagged
  const progress = Math.max(0, 100 - (secondsUntilClaim / CLAIM_CONFIG.cooldownSeconds) * 100)

  return (
    <Button
      asChild
      size={size}
      className={cn(
        "gap-2 relative overflow-hidden transition-all duration-300 font-semibold",
        "h-11 min-w-[140px]",
        canClaim &&
          "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02]",
        className,
      )}
    >
      <Link
        href="/dashboard/claim"
        aria-label={
          secondsUntilClaim > 0 ? `Claim available in ${formatCountdown(secondsUntilClaim)}` : "Go to claim page"
        }
      >
        {/* Progress bar background */}
        {secondsUntilClaim > 0 && (
          <div
            className="absolute inset-0 bg-primary/30 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
        )}

        <span className="relative flex items-center gap-2">
          {profile.is_flagged ? (
            <>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>Under Review</span>
            </>
          ) : secondsUntilClaim > 0 && showTimer ? (
            <>
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="tabular-nums">{formatCountdown(secondsUntilClaim)}</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" aria-hidden="true" />
              <span>Start Claiming</span>
              <ArrowRight className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            </>
          )}
        </span>
      </Link>
    </Button>
  )
}
