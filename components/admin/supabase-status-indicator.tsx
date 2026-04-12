"use client"

import { useSupabaseStatus } from "@/hooks/use-supabase-status"
import { cn } from "@/lib/utils"
import { Database, RefreshCw, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface SupabaseStatusIndicatorProps {
  compact?: boolean
  className?: string
}

export function SupabaseStatusIndicator({ compact = false, className }: SupabaseStatusIndicatorProps) {
  const { status, connected, latency, message, refresh } = useSupabaseStatus()

  const statusConfig = {
    checking: {
      icon: Loader2,
      color: "text-muted-foreground",
      dotColor: "bg-muted-foreground",
      label: "Checking...",
      animate: true,
    },
    connected: {
      icon: CheckCircle,
      color: "text-emerald-500",
      dotColor: "bg-emerald-500",
      label: "Connected",
      animate: false,
    },
    degraded: {
      icon: AlertTriangle,
      color: "text-amber-500",
      dotColor: "bg-amber-500",
      label: "Degraded",
      animate: false,
    },
    disconnected: {
      icon: XCircle,
      color: "text-red-500",
      dotColor: "bg-red-500",
      label: "Disconnected",
      animate: false,
    },
    unconfigured: {
      icon: XCircle,
      color: "text-muted-foreground",
      dotColor: "bg-muted-foreground",
      label: "Not Configured",
      animate: false,
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => refresh()}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors hover:bg-muted",
                className,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", config.dotColor, config.animate && "animate-pulse")} />
              <Database className={cn("h-3 w-3", config.color)} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-sm flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", config.color, config.animate && "animate-spin")} />
                Supabase: {config.label}
              </p>
              <p className="text-xs text-muted-foreground">{message}</p>
              {latency !== null && (
                <p className="text-xs text-muted-foreground">Latency: {latency}ms</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={cn("rounded-lg border p-3", className, {
      "border-emerald-500/30 bg-emerald-500/5": status === "connected",
      "border-amber-500/30 bg-amber-500/5": status === "degraded",
      "border-red-500/30 bg-red-500/5": status === "disconnected",
      "border-border bg-muted/30": status === "unconfigured" || status === "checking",
    })}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", config.color, config.animate && "animate-spin")} />
          <div className="min-w-0">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotColor, config.animate && "animate-pulse")} />
              Supabase: {config.label}
            </p>
            {latency !== null && (
              <p className="text-[10px] text-muted-foreground">{latency}ms</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => refresh()}
        >
          <RefreshCw className="h-3 w-3" />
          <span className="sr-only">Refresh Supabase status</span>
        </Button>
      </div>
      {(status === "disconnected" || status === "unconfigured") && (
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{message}</p>
      )}
    </div>
  )
}
