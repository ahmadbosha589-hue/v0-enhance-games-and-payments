"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Coins,
  Lock,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  HelpCircle,
  Link2,
  ExternalLink,
  Play,
  RefreshCw,
  Shield,
  Zap,
  User,
  Database,
  Wifi,
  Fingerprint,
  Bot,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import Link from "next/link"
import useSWR from "swr"
import { CryptoIcon } from "@/components/crypto-icon"
import confetti from "canvas-confetti"
import { AntiBotVerification } from "@/components/captcha/anti-bot-verification"
import { useDeviceFingerprintContext } from "@/components/security/device-fingerprint-provider"

// FaucetPay supported cryptocurrencies (excluding BTC which is on main claim page)
const FAUCETPAY_CRYPTOS = [
  { symbol: "LTC", name: "Litecoin", decimals: 8 },
  { symbol: "ETH", name: "Ethereum", decimals: 18 },
  { symbol: "DOGE", name: "Dogecoin", decimals: 8 },
  { symbol: "TRX", name: "Tron", decimals: 6 },
  { symbol: "FEY", name: "Feyorra", decimals: 8 },
  { symbol: "ZEC", name: "Zcash", decimals: 8 },
  { symbol: "BCH", name: "Bitcoin Cash", decimals: 8 },
  { symbol: "DASH", name: "Dash", decimals: 8 },
  { symbol: "DGB", name: "DigiByte", decimals: 8 },
  { symbol: "SOL", name: "Solana", decimals: 9 },
  { symbol: "BNB", name: "BNB", decimals: 18 },
  { symbol: "MATIC", name: "Polygon", decimals: 18 },
  { symbol: "USDT", name: "Tether", decimals: 6 },
]

const CLAIM_VALUE_USD = 0.0001 // $0.0001 per claim
const COOLDOWN_SECONDS = 7 // 7 seconds cooldown
const SHORTLINK_REQUIRED_AFTER = 100 // Shortlink required after 100 claims

// Loading step interface
interface LoadingStep {
  id: string
  label: string
  status: "pending" | "loading" | "success" | "error" | "retrying"
  error?: string
  retryCount?: number
}

// Robust fetcher with automatic retry
async function robustFetch<T>(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  timeoutMs = 10000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error("Failed after retries")
}

// SWR fetcher with robust error handling
const swrFetcher = async (url: string) => {
  return robustFetch(url, undefined, 2, 8000)
}

// Detailed loading screen component
function DetailedLoadingScreen({
  steps,
  overallProgress,
  onRetry,
}: {
  steps: LoadingStep[]
  overallProgress: number
  onRetry?: () => void
}) {
  const hasError = steps.some((s) => s.status === "error")

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-xl mx-auto">
        <Card className="border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
              {hasError ? (
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              ) : (
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
              )}
            </div>
            <CardTitle className="text-xl">
              {hasError ? "Loading Issue Detected" : "Initializing Manual Faucet"}
            </CardTitle>
            <CardDescription>
              {hasError
                ? "Some components failed to load. Retrying..."
                : "Please wait while we prepare everything for you"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{Math.round(overallProgress)}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            {/* Individual Steps */}
            <div className="space-y-3">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {step.status === "pending" && (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    {step.status === "loading" && (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    {step.status === "success" && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {step.status === "error" && (
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                    )}
                    {step.status === "retrying" && (
                      <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${step.status === "success"
                          ? "text-green-600"
                          : step.status === "error"
                            ? "text-destructive"
                            : step.status === "loading" || step.status === "retrying"
                              ? "text-primary"
                              : "text-muted-foreground"
                        }`}
                    >
                      {step.label}
                    </p>
                    {step.error && (
                      <p className="text-xs text-destructive/80 mt-0.5 truncate">{step.error}</p>
                    )}
                    {step.status === "retrying" && step.retryCount && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Retry attempt {step.retryCount}...
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <Badge
                    variant={
                      step.status === "success"
                        ? "default"
                        : step.status === "error"
                          ? "destructive"
                          : "outline"
                    }
                    className="flex-shrink-0 text-xs"
                  >
                    {step.status === "pending" && "Waiting"}
                    {step.status === "loading" && "Loading"}
                    {step.status === "success" && "Done"}
                    {step.status === "error" && "Failed"}
                    {step.status === "retrying" && "Retrying"}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Retry Button */}
            {hasError && onRetry && (
              <Button onClick={onRetry} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry All Failed Steps
              </Button>
            )}

            {/* Help Link */}
            <div className="text-center">
              <Button variant="ghost" size="sm" asChild className="text-xs">
                <Link href="/contact">
                  <HelpCircle className="h-3 w-3 mr-1" />
                  Need help? Contact support
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Error state component
function ErrorState({
  error,
  details,
  onRetry,
}: {
  error: string
  details?: string
  onRetry: () => void
}) {
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-md mx-auto">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Failed to Load Manual Faucet
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {details && (
              <div className="p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <p className="text-xs text-muted-foreground font-mono">{details}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={onRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Main faucet content component
function ManualFaucetContent() {
  const supabase = createClient()
  const mountedRef = useRef(true)
  const initStartedRef = useRef(false)

  // Get device fingerprint from context
  const { fingerprint, isLoading: fingerprintLoading, deviceStatus } = useDeviceFingerprintContext()

  // Page states
  const [pageReady, setPageReady] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [fatalErrorDetails, setFatalErrorDetails] = useState<string | undefined>()

  // Loading steps
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([
    { id: "auth", label: "Authenticating User", status: "pending" },
    { id: "fingerprint", label: "Device Fingerprint", status: "pending" },
    { id: "profile", label: "Loading Profile", status: "pending" },
    { id: "ptc", label: "Checking PTC Status", status: "pending" },
    { id: "claims", label: "Loading Claim History", status: "pending" },
    { id: "vpn", label: "Security Check", status: "pending" },
    { id: "prices", label: "Fetching Crypto Prices", status: "pending" },
  ])

  // User data
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  // Faucet states
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const [claimCounts, setClaimCounts] = useState<Record<string, number>>({})
  const [totalClaims, setTotalClaims] = useState(0)
  const [isLocked, setIsLocked] = useState(true)
  const [ptcAdsCompleted, setPtcAdsCompleted] = useState(0)
  const [shortlinkRequired, setShortlinkRequired] = useState(false)

  // Security states
  const [vpnDetected, setVpnDetected] = useState(false)
  const [adblockDetected, setAdblockDetected] = useState(false)

  // Claim states
  const [isClaiming, setIsClaiming] = useState(false)
  const [selectedCrypto, setSelectedCrypto] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)

  // Fetch crypto prices with SWR
  const { data: pricesData, isLoading: pricesLoading } = useSWR<{
    prices: Record<string, { price: number }>
  }>("/api/crypto/prices", swrFetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    errorRetryCount: 3,
    dedupingInterval: 30000,
  })

  // Update step status helper
  const updateStep = useCallback(
    (
      id: string,
      status: LoadingStep["status"],
      error?: string,
      retryCount?: number
    ) => {
      if (!mountedRef.current) return
      setLoadingSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, error, retryCount } : s))
      )
    },
    []
  )

  // Calculate overall progress
  const overallProgress =
    (loadingSteps.filter((s) => s.status === "success").length / loadingSteps.length) * 100

  // Calculate crypto amounts based on $0.0001 value
  const getCryptoAmount = useCallback(
    (symbol: string) => {
      const price = pricesData?.prices?.[symbol]?.price
      if (!price || price === 0) return "0.00000000"
      const amount = CLAIM_VALUE_USD / price
      return amount.toFixed(8)
    },
    [pricesData]
  )

  // Initialize everything with full robustness
  const initialize = useCallback(async () => {
    if (!mountedRef.current) return

    // Reset states for fresh load
    setPageReady(false)
    setFatalError(null)
    setFatalErrorDetails(undefined)
    setLoadingSteps((prev) => prev.map((s) => ({ ...s, status: "pending", error: undefined })))

    try {
      // Step 1: Authenticate user
      updateStep("auth", "loading")
      let authUser: any = null

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) updateStep("auth", "retrying", undefined, attempt)

          const { data, error } = await supabase.auth.getUser()
          if (error) throw error
          if (!data.user) throw new Error("Not authenticated")

          authUser = data.user
          break
        } catch (err) {
          if (attempt === 3) {
            updateStep("auth", "error", err instanceof Error ? err.message : "Auth failed")
            setFatalError("Authentication failed. Please log in again.")
            setFatalErrorDetails(err instanceof Error ? err.message : undefined)
            return
          }
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }

      if (!mountedRef.current) return
      setUser(authUser)
      updateStep("auth", "success")

      // Step 2: Wait for device fingerprint
      updateStep("fingerprint", "loading")
      // We'll check fingerprint status after - it's from context

      // Step 3: Load profile
      updateStep("profile", "loading")
      let userProfile: any = null

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) updateStep("profile", "retrying", undefined, attempt)

          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .single()

          if (error && error.code !== "PGRST116") throw error
          userProfile = data
          break
        } catch (err) {
          if (attempt === 3) {
            updateStep("profile", "error", err instanceof Error ? err.message : "Profile failed")
            // Non-fatal - continue without profile
            break
          }
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }

      if (!mountedRef.current) return
      setProfile(userProfile)
      updateStep("profile", "success")

      // Step 4: Check PTC status
      updateStep("ptc", "loading")
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()

      let ptcCount = 0
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) updateStep("ptc", "retrying", undefined, attempt)

          const { count, error } = await supabase
            .from("ptc_views")
            .select("*", { count: "exact", head: true })
            .eq("user_id", authUser.id)
            .eq("completed", true)
            .gte("viewed_at", todayISO)

          if (error) throw error
          ptcCount = count || 0
          break
        } catch (err) {
          if (attempt === 3) {
            updateStep("ptc", "error", err instanceof Error ? err.message : "PTC check failed")
            // Non-fatal - assume locked
            break
          }
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }

      if (!mountedRef.current) return
      setPtcAdsCompleted(ptcCount)
      setIsLocked(ptcCount < 2)
      updateStep("ptc", "success")

      // Step 5: Load claim history
      updateStep("claims", "loading")
      let claimsData: any[] = []

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) updateStep("claims", "retrying", undefined, attempt)

          const { data, error } = await supabase
            .from("manual_faucet_claims")
            .select("crypto_symbol, claimed_at")
            .eq("user_id", authUser.id)
            .gte("claimed_at", todayISO)
            .order("claimed_at", { ascending: false })

          if (error) throw error
          claimsData = data || []
          break
        } catch (err) {
          if (attempt === 3) {
            updateStep("claims", "error", err instanceof Error ? err.message : "Claims failed")
            // Non-fatal - continue with empty claims
            break
          }
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }

      if (!mountedRef.current) return

      // Process claims data
      const counts: Record<string, number> = {}
      let total = 0
      claimsData.forEach((claim) => {
        counts[claim.crypto_symbol] = (counts[claim.crypto_symbol] || 0) + 1
        total++
      })
      setClaimCounts(counts)
      setTotalClaims(total)

      // Calculate active cooldowns
      const newCooldowns: Record<string, number> = {}
      const now = Date.now()
      claimsData.forEach((claim) => {
        const claimTime = new Date(claim.claimed_at).getTime()
        const elapsed = (now - claimTime) / 1000
        const remaining = Math.max(0, COOLDOWN_SECONDS - elapsed)
        if (remaining > 0 && remaining > (newCooldowns[claim.crypto_symbol] || 0)) {
          newCooldowns[claim.crypto_symbol] = Math.ceil(remaining)
        }
      })
      setCooldowns(newCooldowns)

      // Check shortlink requirement
      if (total > 0 && total % SHORTLINK_REQUIRED_AFTER === 0) {
        try {
          const { data: shortlinkData } = await supabase
            .from("shortlink_views")
            .select("viewed_at")
            .eq("user_id", authUser.id)
            .gte("viewed_at", todayISO)
            .order("viewed_at", { ascending: false })
            .limit(1)

          const lastClaimTime = claimsData[0]?.claimed_at
          const lastShortlinkTime = shortlinkData?.[0]?.viewed_at

          if (!lastShortlinkTime || new Date(lastShortlinkTime) < new Date(lastClaimTime)) {
            setShortlinkRequired(true)
          }
        } catch {
          // If check fails, don't require shortlink
        }
      }

      updateStep("claims", "success")

      // Step 6: Security check (VPN detection)
      updateStep("vpn", "loading")
      try {
        const response = await robustFetch<{ isAllowed: boolean }>(
          "/api/security/vpn-check",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              language: navigator.language,
              userAgent: navigator.userAgent,
            }),
          },
          2,
          5000
        )
        setVpnDetected(!response.isAllowed)
        updateStep("vpn", "success")
      } catch {
        // On error, allow user to continue
        setVpnDetected(false)
        updateStep("vpn", "success")
      }

      // Step 7: Crypto prices (handled by SWR, just mark complete)
      updateStep("prices", "loading")
      // Small delay to let SWR fetch
      await new Promise((r) => setTimeout(r, 500))
      updateStep("prices", "success")

      // Adblock check (non-blocking)
      try {
        const bait = document.createElement("div")
        bait.className = "adsbox ad-banner pub_300x250"
        bait.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;"
        document.body.appendChild(bait)
        await new Promise((r) => setTimeout(r, 100))
        const isHidden =
          bait.offsetParent === null ||
          bait.offsetHeight === 0 ||
          bait.offsetWidth === 0 ||
          getComputedStyle(bait).display === "none"
        try {
          document.body.removeChild(bait)
        } catch { }
        setAdblockDetected(isHidden)
      } catch {
        setAdblockDetected(false)
      }

      // All done - page is ready!
      if (mountedRef.current) {
        setPageReady(true)
      }
    } catch (err) {
      if (mountedRef.current) {
        setFatalError("An unexpected error occurred")
        setFatalErrorDetails(err instanceof Error ? err.message : undefined)
      }
    }
  }, [supabase, updateStep])

  // Update fingerprint step when context changes
  useEffect(() => {
    if (fingerprintLoading) {
      updateStep("fingerprint", "loading")
    } else if (fingerprint) {
      updateStep("fingerprint", "success")
    } else {
      // Fingerprint failed but don't block - mark as success anyway
      updateStep("fingerprint", "success")
    }
  }, [fingerprint, fingerprintLoading, updateStep])

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true

    if (!initStartedRef.current) {
      initStartedRef.current = true
      initialize()
    }

    return () => {
      mountedRef.current = false
    }
  }, [initialize])

  // Cooldown countdown timer
  useEffect(() => {
    if (!pageReady) return

    const interval = setInterval(() => {
      setCooldowns((prev) => {
        const newCooldowns = { ...prev }
        let hasChanges = false
        Object.keys(newCooldowns).forEach((key) => {
          if (newCooldowns[key] > 0) {
            newCooldowns[key]--
            hasChanges = true
            if (newCooldowns[key] === 0) {
              delete newCooldowns[key]
            }
          }
        })
        return hasChanges ? newCooldowns : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [pageReady])

  // Handle verification complete
  const handleVerificationComplete = (token: string) => {
    setVerificationToken(token)
    setIsVerified(true)
    toast.success("Verification complete!", { description: "You can now claim your rewards" })
  }

  // Handle verification fail
  const handleVerificationFail = (reason: string) => {
    toast.error("Verification failed", { description: reason })
    setIsVerified(false)
    setVerificationToken(null)
  }

  // Handle claim
  const handleClaim = async (symbol: string) => {
    if (isClaiming || !user || !verificationToken) return
    if (cooldowns[symbol] && cooldowns[symbol] > 0) return
    if (shortlinkRequired) {
      toast.error("Shortlink Required", {
        description: "Please complete 1 shortlink to continue claiming",
      })
      return
    }
    if (vpnDetected) {
      toast.error("VPN/Proxy detected", {
        description: "Please disable your VPN or proxy to claim rewards.",
      })
      return
    }
    if (adblockDetected) {
      toast.error("AdBlock Detected", {
        description: "Please disable your ad blocker to claim rewards.",
      })
      return
    }
    if (deviceStatus === "blocked") {
      toast.error("Device Blocked", {
        description: "This device has been flagged for suspicious activity.",
      })
      return
    }

    setIsClaiming(true)
    setSelectedCrypto(symbol)

    try {
      const response = await robustFetch<{ amount: string; error?: string }>(
        "/api/manual-faucet/claim",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cryptoSymbol: symbol,
            captchaToken: verificationToken,
            fingerprint: fingerprint,
          }),
        },
        2,
        15000
      )

      if (response.error) {
        throw new Error(response.error)
      }

      // Success
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ["#00D4FF", "#10B981", "#F59E0B"],
        })
      } catch { }

      toast.success(`Claimed ${response.amount} ${symbol}!`, {
        description: `Sent to your FaucetPay account`,
      })

      // Update cooldown
      setCooldowns((prev) => ({ ...prev, [symbol]: COOLDOWN_SECONDS }))

      // Update claim counts
      setClaimCounts((prev) => ({
        ...prev,
        [symbol]: (prev[symbol] || 0) + 1,
      }))

      const newTotal = totalClaims + 1
      setTotalClaims(newTotal)

      // Check if shortlink is now required
      if (newTotal > 0 && newTotal % SHORTLINK_REQUIRED_AFTER === 0) {
        setShortlinkRequired(true)
      }

      // Reset verification for next claim
      setIsVerified(false)
      setVerificationToken(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim", {
        description: "Please try again.",
      })
    } finally {
      setIsClaiming(false)
      setSelectedCrypto(null)
    }
  }

  // Retry handler
  const handleRetry = () => {
    initStartedRef.current = false
    initialize()
  }

  // Render loading screen
  if (!pageReady && !fatalError) {
    return (
      <DetailedLoadingScreen
        steps={loadingSteps}
        overallProgress={overallProgress}
        onRetry={handleRetry}
      />
    )
  }

  // Render error screen
  if (fatalError) {
    return <ErrorState error={fatalError} details={fatalErrorDetails} onRetry={handleRetry} />
  }

  // Render main content
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 mb-4">
              <Coins className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Manual Crypto Faucet</h1>
            <p className="text-muted-foreground">
              Claim small amounts of crypto every 7 seconds - sent directly to FaucetPay
            </p>
          </div>
          <div className="flex items-center gap-2">
            {deviceStatus === "trusted" && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30">
                <Fingerprint className="h-3 w-3" />
                Verified Device
              </Badge>
            )}
            <Button variant="outline" asChild className="gap-2">
              <Link href="/contact">
                <HelpCircle className="h-4 w-4" />
                Need help?
              </Link>
            </Button>
          </div>
        </div>

        {/* Security Warnings */}
        {vpnDetected && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>VPN/Proxy Detected</AlertTitle>
            <AlertDescription>
              Please disable your VPN, proxy, or Tor connection to claim rewards.
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Re-check VPN
                  robustFetch<{ isAllowed: boolean }>(
                    "/api/security/vpn-check",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        language: navigator.language,
                        userAgent: navigator.userAgent,
                      }),
                    },
                    1,
                    5000
                  )
                    .then((r) => setVpnDetected(!r.isAllowed))
                    .catch(() => { })
                }}
                className="mt-2 ml-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Re-check
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {adblockDetected && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500">AdBlock Detected</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Please disable your ad blocker to claim rewards. Our site relies on ads to provide
                free cryptocurrency.
              </p>
              <p className="text-sm text-muted-foreground">
                After disabling your ad blocker, please refresh the page to continue.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {deviceStatus === "flagged" && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Device Under Review</AlertTitle>
            <AlertDescription>
              Unusual activity detected on this device. Some features may be restricted.
            </AlertDescription>
          </Alert>
        )}

        {deviceStatus === "blocked" && (
          <Alert variant="destructive">
            <Lock className="h-4 w-4" />
            <AlertTitle>Device Blocked</AlertTitle>
            <AlertDescription>
              This device has been flagged for suspicious activity. Claiming is disabled.
            </AlertDescription>
          </Alert>
        )}

        {/* Locked State - Need 2 PTC Ads */}
        {isLocked && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Lock className="h-10 w-10 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Access Locked</h2>
                  <p className="text-muted-foreground mt-1">
                    Complete{" "}
                    <span className="font-bold text-amber-500">2 PTC Ads</span> to unlock the
                    Manual Faucet
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={(ptcAdsCompleted / 2) * 100} className="w-48 h-2" />
                  <span className="text-sm font-medium">{ptcAdsCompleted}/2</span>
                </div>
                <Button asChild className="gap-2 bg-amber-500 hover:bg-amber-600">
                  <Link href="/dashboard/ptc">
                    <Play className="h-4 w-4" />
                    Watch PTC Ads
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shortlink Required Warning */}
        {!isLocked && shortlinkRequired && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500">Shortlink Required!</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                After every{" "}
                <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                  {SHORTLINK_REQUIRED_AFTER} faucet
                </span>{" "}
                claims,{" "}
                <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                  1 Shortlink
                </span>{" "}
                must be completed to continue again!
              </p>
              <Button asChild variant="destructive" className="gap-2">
                <Link href="/dashboard/shortlinks">
                  <Link2 className="h-4 w-4" />
                  Complete Shortlink
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        {!isLocked && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
              <CardContent className="p-4 text-center">
                <Zap className="h-6 w-6 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Claims Today</p>
                <p className="text-2xl font-bold">{totalClaims}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cooldown</p>
                <p className="text-2xl font-bold">{COOLDOWN_SECONDS}s</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
              <CardContent className="p-4 text-center">
                <Coins className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Value/Claim</p>
                <p className="text-2xl font-bold">${CLAIM_VALUE_USD}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/30">
              <CardContent className="p-4 text-center">
                <Link2 className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Until Shortlink</p>
                <p className="text-2xl font-bold">
                  {SHORTLINK_REQUIRED_AFTER - (totalClaims % SHORTLINK_REQUIRED_AFTER)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Verification Section */}
        {!isLocked && !shortlinkRequired && !isVerified && deviceStatus !== "blocked" && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Anti-Bot Verification
              </CardTitle>
              <CardDescription>
                Complete the verification challenges to prove you are human
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AntiBotVerification
                onComplete={handleVerificationComplete}
                onFail={handleVerificationFail}
                difficulty="normal"
                requireProofOfWork={false}
              />
            </CardContent>
          </Card>
        )}

        {/* Crypto Grid */}
        {!isLocked && !shortlinkRequired && isVerified && deviceStatus !== "blocked" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Select Cryptocurrency</h2>
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Verified
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {FAUCETPAY_CRYPTOS.map((crypto) => {
                const amount = getCryptoAmount(crypto.symbol)
                const cooldown = cooldowns[crypto.symbol] || 0
                const claimCount = claimCounts[crypto.symbol] || 0
                const isOnCooldown = cooldown > 0
                const isCurrentClaim = isClaiming && selectedCrypto === crypto.symbol

                return (
                  <Card
                    key={crypto.symbol}
                    className={`relative transition-all duration-300 hover:shadow-lg ${isOnCooldown
                        ? "opacity-60 border-muted"
                        : "border-primary/30 hover:border-primary/50 hover:scale-[1.02]"
                      }`}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                      {/* Crypto Icon */}
                      <CryptoIcon symbol={crypto.symbol} size="xl" />

                      {/* Crypto Name */}
                      <div>
                        <h3 className="font-bold text-lg">{crypto.symbol}</h3>
                        <p className="text-xs text-muted-foreground">{crypto.name}</p>
                      </div>

                      {/* Amount */}
                      <div className="bg-muted/50 rounded-lg px-3 py-2 w-full">
                        <p className="text-xs text-muted-foreground">Reward</p>
                        <p className="font-mono font-bold text-sm">
                          {amount} {crypto.symbol}
                        </p>
                      </div>

                      {/* Claim Count */}
                      <p className="text-xs text-muted-foreground">Claims today: {claimCount}</p>

                      {/* Claim Button */}
                      <Button
                        className="w-full gap-2"
                        disabled={isOnCooldown || isClaiming || vpnDetected || adblockDetected}
                        onClick={() => handleClaim(crypto.symbol)}
                      >
                        {isCurrentClaim ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Claiming...
                          </>
                        ) : isOnCooldown ? (
                          <>
                            <Clock className="h-4 w-4" />
                            {cooldown}s
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            Claim
                          </>
                        )}
                      </Button>
                    </CardContent>

                    {/* Cooldown Overlay */}
                    {isOnCooldown && (
                      <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-3xl font-bold">{cooldown}s</div>
                          <p className="text-xs text-muted-foreground">Cooldown</p>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Shortlink Warning Banner - Always visible at bottom when not required */}
        {!isLocked && !shortlinkRequired && (
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Important Notice</AlertTitle>
            <AlertDescription className="text-amber-600/80">
              After every{" "}
              <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                {SHORTLINK_REQUIRED_AFTER} faucet
              </span>{" "}
              claims,{" "}
              <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                1 Shortlink
              </span>{" "}
              must be completed to continue again! You have{" "}
              <span className="font-bold">
                {SHORTLINK_REQUIRED_AFTER - (totalClaims % SHORTLINK_REQUIRED_AFTER)}
              </span>{" "}
              claims remaining.
            </AlertDescription>
          </Alert>
        )}

        {/* Need Help Button (Mobile Footer) */}
        <div className="fixed bottom-4 right-4 sm:hidden">
          <Button asChild size="lg" className="rounded-full shadow-lg gap-2">
            <Link href="/contact">
              <HelpCircle className="h-5 w-5" />
              Need Help?
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

// Main export with Suspense boundary
export default function ManualFaucetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading Manual Faucet...</p>
          </div>
        </div>
      }
    >
      <ManualFaucetContent />
    </Suspense>
  )
}
