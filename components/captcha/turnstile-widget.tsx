"use client"

import { useEffect, useRef, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          "error-callback"?: (error: any) => void
          "expired-callback"?: () => void
          theme?: "light" | "dark" | "auto"
          size?: "normal" | "compact"
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

interface TurnstileWidgetProps {
  siteKey: string
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: "light" | "dark" | "auto"
  size?: "normal" | "compact"
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = "auto",
  size = "normal",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)

  const initializeTurnstile = () => {
    setError(null)
    setIsLoading(true)
    setVerified(false)

    // If no site key provided, skip Turnstile
    if (!siteKey) {
      console.log("[Turnstile] No site key configured, skipping")
      setIsLoading(false)
      onError?.()
      return
    }

    const effectiveSiteKey = siteKey

    // Check if script already loaded
    if (window.turnstile && containerRef.current) {
      // Clean up existing widget
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {}
        widgetIdRef.current = null
      }
      renderWidget(effectiveSiteKey)
      return
    }

    // Load script
    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      existingScript.remove()
    }

    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
    script.async = true
    script.defer = true

    script.onload = () => {
      const checkTurnstile = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkTurnstile)
          renderWidget(effectiveSiteKey)
        }
      }, 100)

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkTurnstile)
        if (!widgetIdRef.current) {
          setError("Turnstile failed to load. Please refresh the page.")
          setIsLoading(false)
          onError?.()
        }
      }, 10000)
    }

    script.onerror = () => {
      setError("Failed to load verification. Please check your connection.")
      setIsLoading(false)
      onError?.()
    }

    document.body.appendChild(script)
  }

  const renderWidget = (key: string) => {
    if (!containerRef.current || !window.turnstile) return

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: key,
        callback: (token) => {
          setError(null)
          setVerified(true)
          setIsLoading(false)
          onVerify(token)
        },
        "error-callback": (err) => {
          console.error("[Turnstile] Error:", err)
          setError("Verification failed. Please try again.")
          setIsLoading(false)
          onError?.()
        },
        "expired-callback": () => {
          setVerified(false)
          onExpire?.()
        },
        theme,
        size,
      })
      setIsLoading(false)
    } catch (err) {
      console.error("[Turnstile] Render error:", err)
      setError("Failed to initialize verification.")
      setIsLoading(false)
      onError?.()
    }
  }

  useEffect(() => {
    initializeTurnstile()

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {}
      }
    }
  }, [siteKey])

  if (verified) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <CheckCircle className="h-5 w-5 text-green-500" />
        <span className="text-sm text-green-600">Verification complete</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
        <Button variant="outline" size="sm" onClick={initializeTurnstile} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center">
      {isLoading && <Skeleton className="h-[65px] w-[300px]" />}
      <div ref={containerRef} className={isLoading ? "hidden" : ""} />
    </div>
  )
}
