"use client"

import { useState, useEffect } from "react"
import { useSupabaseStatus } from "@/hooks/use-supabase-status"
import { AlertTriangle, Database, RefreshCw, X, WifiOff, CheckCircle, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from "next/link"

export function ConnectivityBanner() {
  const { status, message, refresh, connected, latency, consecutiveFailures } = useSupabaseStatus()
  const [dismissed, setDismissed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [wasDisconnected, setWasDisconnected] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)

  // Track recovery from disconnected state
  useEffect(() => {
    if (status === "disconnected" || status === "unconfigured") {
      setWasDisconnected(true)
    } else if (wasDisconnected && status === "connected") {
      setShowRecovery(true)
      const timer = setTimeout(() => {
        setShowRecovery(false)
        setWasDisconnected(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [status, wasDisconnected])

  // Reset dismissed state when status changes
  useEffect(() => {
    if (status === "disconnected" && dismissed) {
      setDismissed(false)
    }
  }, [status, dismissed])

  const handleRetry = async () => {
    setIsRetrying(true)
    await refresh()
    setIsRetrying(false)
  }

  // Show recovery banner briefly
  if (showRecovery) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm border-b bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
        <CheckCircle className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-xs sm:text-sm">
          Database connection restored{latency ? ` (${latency}ms)` : ""}
        </p>
      </div>
    )
  }

  // Only show for problematic states
  if (connected || status === "checking" || status === "connected" || dismissed) {
    return null
  }

  const isUnconfigured = status === "unconfigured"
  const isDegraded = status === "degraded"
  const isDisconnected = status === "disconnected"

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm border-b",
        isUnconfigured
          ? "bg-muted/50 border-border text-muted-foreground"
          : isDegraded
            ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-destructive/10 border-destructive/20 text-destructive"
      )}
    >
      {isUnconfigured ? (
        <Database className="h-4 w-4 shrink-0" />
      ) : isDegraded ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
      )}

      <p className="flex-1 text-xs sm:text-sm truncate">
        {isUnconfigured
          ? "Supabase is not configured. Admin features require a database connection."
          : isDegraded
            ? `Database responding slowly${latency ? ` (${latency}ms)` : ""}. Some operations may be delayed.`
            : `Database connection lost${consecutiveFailures > 1 ? ` (${consecutiveFailures} attempts)` : ""}. ${message}`}
      </p>

      <div className="flex items-center gap-1.5 shrink-0">
        {isUnconfigured && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            asChild
          >
            <Link href="/admin/env-vars">
              <Settings className="h-3 w-3 mr-1" />
              Configure
            </Link>
          </Button>
        )}
        {!isUnconfigured && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isRetrying && "animate-spin")} />
            {isRetrying ? "Checking..." : "Retry"}
          </Button>
        )}
        {(isDegraded || isUnconfigured) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss</span>
          </Button>
        )}
      </div>
    </div>
  )
}
