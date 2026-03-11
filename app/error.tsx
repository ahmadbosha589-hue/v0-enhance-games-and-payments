"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoFull } from "@/components/icons/logo"
import Link from "next/link"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("[App Error]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-destructive/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md text-center">
        <Link href="/" aria-label="Go to homepage">
          <LogoFull size="lg" className="mx-auto mb-8" />
        </Link>

        <div className="mb-8 flex justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-2 text-muted-foreground">
          An unexpected error occurred. We&apos;ve been notified and are working on it.
        </p>

        {error.digest && (
          <p className="mb-6 rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>

        <div className="mt-8 pt-8 border-t border-border/40">
          <p className="text-sm text-muted-foreground mb-3">Problem persists?</p>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contact" className="gap-2">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Contact Support
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
