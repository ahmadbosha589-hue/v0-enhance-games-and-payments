"use client"

import { useEffect, useRef, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          "error-callback"?: (error: any) => void
          "expired-callback"?: () => void
          theme?: "light" | "dark"
          size?: "normal" | "compact" | "invisible"
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
      execute: (widgetId: string) => void
    }
    onHCaptchaLoad?: () => void
  }
}

interface HCaptchaWidgetProps {
  siteKey: string
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: "light" | "dark"
  size?: "normal" | "compact" | "invisible"
}

export function HCaptchaWidget({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = "dark",
  size = "normal",
}: HCaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)

  const initializeHCaptcha = () => {
    setError(null)
    setIsLoading(true)
    setVerified(false)

    // If no site key provided, skip hCaptcha
    if (!siteKey) {
      console.log("[hCaptcha] No site key configured, skipping")
      setIsLoading(false)
      onError?.()
      return
    }

    // Check if script already loaded
    if (window.hcaptcha && containerRef.current) {
      // Clean up existing widget
      if (widgetIdRef.current) {
        try {
          window.hcaptcha.remove(widgetIdRef.current)
        } catch {}
        widgetIdRef.current = null
      }
      renderWidget(siteKey)
      return
    }

    // Load script
    const existingScript = document.querySelector('script[src*="hcaptcha"]')
    if (existingScript) {
      existingScript.remove()
    }

    // Set up callback for when hCaptcha loads
    window.onHCaptchaLoad = () => {
      renderWidget(siteKey)
    }

    const script = document.createElement("script")
    script.src = "https://js.hcaptcha.com/1/api.js?onload=onHCaptchaLoad&render=explicit"
    script.async = true
    script.defer = true

    script.onerror = () => {
      setError("Failed to load verification. Please check your connection.")
      setIsLoading(false)
      onError?.()
    }

    document.body.appendChild(script)

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!widgetIdRef.current && isLoading) {
        setError("hCaptcha failed to load. Please refresh the page.")
        setIsLoading(false)
        onError?.()
      }
    }, 15000)
  }

  const renderWidget = (key: string) => {
    if (!containerRef.current || !window.hcaptcha) return

    try {
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: key,
        callback: (token) => {
          setError(null)
          setVerified(true)
          setIsLoading(false)
          onVerify(token)
        },
        "error-callback": (err) => {
          console.error("[hCaptcha] Error:", err)
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
      console.error("[hCaptcha] Render error:", err)
      setError("Failed to initialize verification.")
      setIsLoading(false)
      onError?.()
    }
  }

  useEffect(() => {
    initializeHCaptcha()

    return () => {
      if (widgetIdRef.current && window.hcaptcha) {
        try {
          window.hcaptcha.remove(widgetIdRef.current)
        } catch {}
      }
      // Clean up global callback
      delete window.onHCaptchaLoad
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
        <Button variant="outline" size="sm" onClick={initializeHCaptcha} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center">
      {isLoading && <Skeleton className="h-[78px] w-[303px]" />}
      <div ref={containerRef} className={isLoading ? "hidden" : ""} />
    </div>
  )
}
