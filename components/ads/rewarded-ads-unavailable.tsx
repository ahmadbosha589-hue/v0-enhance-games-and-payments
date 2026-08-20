"use client"

import Link from "next/link"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface RewardedAdsUnavailableProps {
  compact?: boolean
  className?: string
}

/**
 * Honest replacement for old client-only rewarded-ad timers.
 * The payout endpoints stay disabled until server-side watch proof and a
 * verified incentivized provider are available.
 */
export function RewardedAdsUnavailable({ compact = false, className }: RewardedAdsUnavailableProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
        compact ? "p-2" : "p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Rewarded bonuses unavailable</p>
          {!compact && (
            <p className="mt-1 text-xs text-muted-foreground">
              Verified rewarded-ad inventory and server-side watch proof are not enabled for this deployment.
            </p>
          )}
          <Button asChild size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs">
            <Link href="/dashboard/support-us">
              View Support Us
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
