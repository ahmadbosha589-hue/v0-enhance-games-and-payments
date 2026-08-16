"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Database, RefreshCw, Settings } from "lucide-react"
import Link from "next/link"

interface SupabaseUnavailableProps {
  title?: string
  description?: string
  showSettingsLink?: boolean
  onRetry?: () => void
  isRetrying?: boolean
  variant?: "full" | "card" | "inline"
}

export function SupabaseUnavailable({
  title = "Database Unavailable",
  description = "This page requires a connection to Supabase. The database is either not configured or temporarily unavailable.",
  showSettingsLink = true,
  onRetry,
  isRetrying = false,
  variant = "full",
}: SupabaseUnavailableProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying} className="shrink-0">
            <RefreshCw className={`h-3 w-3 mr-1.5 ${isRetrying ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}
      </div>
    )
  }

  if (variant === "card") {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? "animate-spin" : ""}`} />
                Retry Connection
              </Button>
            )}
            {showSettingsLink && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/env-vars">
                  <Settings className="h-4 w-4 mr-2" />
                  Check Configuration
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full variant
  return (
    <div className="flex items-center justify-center min-h-[50vh] p-4">
      <Card className="max-w-lg w-full border-amber-500/30">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
            <Database className="h-7 w-7 text-amber-500" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">Possible causes:</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                Supabase environment variables are not set (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                Supabase service is temporarily unavailable or undergoing maintenance
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                Database tables have not been created yet (run migrations)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                Network connectivity issues between the server and Supabase
              </li>
            </ul>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {onRetry && (
              <Button onClick={onRetry} disabled={isRetrying} className="flex-1">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? "animate-spin" : ""}`} />
                Retry Connection
              </Button>
            )}
            {showSettingsLink && (
              <Button variant="outline" asChild className="flex-1">
                <Link href="/admin/env-vars">
                  <Settings className="h-4 w-4 mr-2" />
                  Check Environment Variables
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
