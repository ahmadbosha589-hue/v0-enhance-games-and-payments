"use client"

import { Component, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Database, RefreshCw, Home, Settings } from "lucide-react"
import Link from "next/link"
import { useSupabaseStatus } from "@/hooks/use-supabase-status"

interface AdminErrorBoundaryProps {
  children: ReactNode
  pageName?: string
  fallbackMessage?: string
}

interface AdminErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// Separate component to use hooks
function ErrorFallbackContent({
  error,
  pageName,
  fallbackMessage,
  onReset,
}: {
  error: Error | null
  pageName?: string
  fallbackMessage?: string
  onReset: () => void
}) {
  const { status, connected, refresh, isRefreshing } = useSupabaseStatus()

  const isSupabaseIssue = !connected || status === "disconnected" || status === "unconfigured"
  const isDegraded = status === "degraded"

  const handleRetry = async () => {
    await refresh()
    onReset()
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh] p-4">
      <Card className={`max-w-lg w-full ${isSupabaseIssue ? "border-amber-500/30" : "border-destructive/30"}`}>
        <CardHeader className="text-center">
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isSupabaseIssue ? "bg-amber-500/10" : "bg-destructive/10"
            }`}>
            {isSupabaseIssue ? (
              <Database className="h-7 w-7 text-amber-500" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isSupabaseIssue
              ? "Database Connection Issue"
              : `Error Loading ${pageName || "Page"}`}
          </CardTitle>
          <CardDescription className="text-sm">
            {isSupabaseIssue
              ? "Unable to connect to the database. This may be a temporary issue or the database is not configured."
              : fallbackMessage || "Something went wrong while loading this section."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status indicator */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500" :
                  status === "degraded" ? "bg-amber-500" :
                    status === "disconnected" ? "bg-red-500" :
                      "bg-muted-foreground"
                }`} />
              <span className="font-medium">Supabase Status:</span>
              <span className="text-muted-foreground capitalize">
                {status === "checking" ? "Checking..." : status}
              </span>
            </div>
          </div>

          {/* Error details in dev mode */}
          {process.env.NODE_ENV === "development" && error && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                {error.message}
              </pre>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleRetry}
              disabled={isRefreshing}
              className="flex-1"
              variant={isSupabaseIssue ? "default" : "outline"}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Retrying..." : "Retry"}
            </Button>
            {isSupabaseIssue && (
              <Button variant="outline" asChild className="flex-1">
                <Link href="/admin/env-vars">
                  <Settings className="h-4 w-4 mr-2" />
                  Check Configuration
                </Link>
              </Button>
            )}
            <Button variant="ghost" asChild className="flex-1">
              <Link href="/admin">
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export class AdminErrorBoundary extends Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): AdminErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[v0] AdminErrorBoundary caught error in ${this.props.pageName || "page"}:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackContent
          error={this.state.error}
          pageName={this.props.pageName}
          fallbackMessage={this.props.fallbackMessage}
          onReset={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

// Functional wrapper for easier use
export function withAdminErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName?: string
) {
  return function WithErrorBoundary(props: P) {
    return (
      <AdminErrorBoundary pageName={pageName}>
        <WrappedComponent {...props} />
      </AdminErrorBoundary>
    )
  }
}
