"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home, Database, Settings } from "lucide-react"
import Link from "next/link"
import { useSupabaseStatus } from "@/hooks/use-supabase-status"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { status, connected, refresh, isRefreshing } = useSupabaseStatus()

  useEffect(() => {
    // Log error for debugging in development
    if (process.env.NODE_ENV === "development") {
      console.error("Admin error:", error)
    }
  }, [error])

  const isSupabaseIssue = !connected || status === "disconnected" || status === "unconfigured"

  const handleRetry = async () => {
    if (!connected) {
      await refresh()
    }
    reset()
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <Card className={`max-w-md w-full ${isSupabaseIssue ? "border-amber-500/30" : ""}`}>
        <CardHeader className="text-center">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isSupabaseIssue ? "bg-amber-500/10" : "bg-destructive/10"
            }`}>
            {isSupabaseIssue ? (
              <Database className="h-6 w-6 text-amber-500" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-destructive" />
            )}
          </div>
          <CardTitle>
            {isSupabaseIssue ? "Database Connection Issue" : "Admin Panel Error"}
          </CardTitle>
          <CardDescription>
            {isSupabaseIssue
              ? "Unable to connect to the database. Please check your Supabase configuration."
              : "Something went wrong loading the admin panel. This might be a temporary issue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500" :
              status === "degraded" ? "bg-amber-500" :
                status === "disconnected" ? "bg-red-500" :
                  "bg-muted-foreground animate-pulse"
              }`} />
            Database: <span className="capitalize">{status}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleRetry} className="flex-1" disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Checking..." : "Try Again"}
            </Button>
            {isSupabaseIssue && (
              <Button variant="outline" asChild className="flex-1">
                <Link href="/admin/env-vars">
                  <Settings className="h-4 w-4 mr-2" />
                  Check Config
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild className="flex-1 bg-transparent">
              <Link href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                User Dashboard
              </Link>
            </Button>
          </div>
          {process.env.NODE_ENV === "development" && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Error Details</summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">{error.message}</pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
