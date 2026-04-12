"use client"

import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home, Crown } from "lucide-react"
import Link from "next/link"
import { useSupabaseStatus } from "@/hooks/use-supabase-status"

export default function TournamentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { status, connected, refresh, isRefreshing } = useSupabaseStatus()

  useEffect(() => {
    console.error("[v0] Tournaments page error:", error)
  }, [error])

  const isSupabaseIssue = !connected || status === "disconnected" || status === "unconfigured"

  const handleRetry = async () => {
    if (!connected) {
      await refresh()
    }
    reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-yellow-500" />
        <h1 className="text-2xl font-bold tracking-tight">Tournament Management</h1>
      </div>

      <Card className={isSupabaseIssue ? "border-amber-500/30" : "border-destructive/30"}>
        <CardHeader className="text-center">
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isSupabaseIssue ? "bg-amber-500/10" : "bg-destructive/10"
            }`}>
            <AlertTriangle className={`h-7 w-7 ${isSupabaseIssue ? "text-amber-500" : "text-destructive"}`} />
          </div>
          <CardTitle>
            {isSupabaseIssue ? "Database Connection Required" : "Unable to Load Tournaments"}
          </CardTitle>
          <CardDescription>
            {isSupabaseIssue
              ? "Tournament data requires a database connection. Please check your Supabase configuration."
              : "There was a problem loading the tournaments. This may be a temporary issue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500" :
                status === "degraded" ? "bg-amber-500" :
                  status === "disconnected" ? "bg-red-500" :
                    "bg-muted-foreground animate-pulse"
              }`} />
            Database: <span className="capitalize">{status}</span>
          </div>

          {process.env.NODE_ENV === "development" && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Error Details</summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">{error.message}</pre>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={handleRetry} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Checking..." : "Try Again"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin">
                <Home className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
