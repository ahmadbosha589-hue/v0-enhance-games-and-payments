"use client"

import { useState } from "react"
import { useSupabaseStatus } from "@/hooks/use-supabase-status"
import { AlertTriangle, Database, RefreshCw, X, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ConnectivityBanner() {
  const { status, message, refresh, connected } = useSupabaseStatus()
  const [dismissed, setDismissed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  // Only show for disconnected or unconfigured states
  if (connected || status === "checking" || status === "connected" || dismissed) {
    return null
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    await refresh()
    setIsRetrying(false)
  }

  const isUnconfigured = status === "unconfigured"

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm border-b",
        isUnconfigured
          ? "bg-muted/50 border-border text-muted-foreground"
          : status === "degraded"
            ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-destructive/10 border-destructive/20 text-destructive"
      )}
    >
      {isUnconfigured ? (
        <Database className="h-4 w-4 shrink-0" />
      ) : status === "degraded" ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0" />
      )}

      <p className="flex-1 text-xs sm:text-sm truncate">
        {isUnconfigured
          ? "Supabase is not configured. Some features will show placeholder data."
          : status === "degraded"
            ? `Database is responding slowly. ${message}`
            : `Database connection lost. ${message}`}
      </p>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isUnconfigured && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isRetrying && "animate-spin")} />
            Retry
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  )
}
