"use client"

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react"
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
  Bot,
  Fingerprint,
  Database,
} from "lucide-react"
import { createClient, isSupabaseConfigured, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"
import useSWR from "swr"
import { useAdblock } from "@/components/adblock/adblock-provider"
import { CryptoIcon } from "@/components/crypto-icon"
import confetti from "canvas-confetti"
import { AntiBotVerification } from "@/components/captcha/anti-bot-verification"
import { useDeviceFingerprintContext } from "@/components/security/device-fingerprint-provider"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { RewardedAdsUnavailable } from "@/components/ads/rewarded-ads-unavailable"

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

const CLAIM_VALUE_USD = 0.0009
const COOLDOWN_SECONDS = 60
const SHORTLINK_REQUIRED_AFTER = 100

// Cache keys for session storage (session data) and localStorage (persistent flags)
const CACHE_KEYS = {
  AUTH_USER: "mf_auth_user_v1",
  PROFILE: "mf_profile_v1",
  PTC_COUNT: "mf_ptc_count_v1",
  CLAIMS_DATA: "mf_claims_data_v1",
  CACHE_TIME: "mf_cache_time_v1",
}
// Keys stored in localStorage for persistence across sessions
const PERSISTENT_KEYS = {
  HAS_CLAIMED_BEFORE: "mf_has_claimed_v3", // Show timer only AFTER first successful claim
}
// Session-only keys
const SESSION_KEYS = {
  LAST_VISIT_TIME: "mf_last_visit_v2", // Track last visit timestamp (resets on browser close)
}
const CACHE_TTL_MS = 30000 // 30 seconds cache TTL

// Loading step interface
interface LoadingStep {
  id: string
  label: string
  status: "pending" | "loading" | "success" | "error" | "retrying" | "cached"
  error?: string
  retryCount?: number
}

// Safe sessionStorage helper for cache data
const safeStorage = {
  get: <T,>(key: string): T | null => {
    try {
      if (typeof window === "undefined") return null
      const item = sessionStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  },
  set: (key: string, value: unknown): void => {
    try {
      if (typeof window === "undefined") return
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ignore storage errors
    }
  },
  clear: (): void => {
    try {
      if (typeof window === "undefined") return
      Object.values(CACHE_KEYS).forEach((key) => sessionStorage.removeItem(key))
    } catch {
      // Ignore
    }
  },
}

// Safe localStorage helper for persistent data (survives browser close)
const safePersistentStorage = {
  get: <T,>(key: string): T | null => {
    try {
      if (typeof window === "undefined") return null
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  },
  set: (key: string, value: unknown): void => {
    try {
      if (typeof window === "undefined") return
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ignore storage errors
    }
  },
}

// Check if cache is still valid
function isCacheValid(): boolean {
  const cacheTime = safeStorage.get<number>(CACHE_KEYS.CACHE_TIME)
  if (!cacheTime) return false
  return Date.now() - cacheTime < CACHE_TTL_MS
}

// Promise with strict timeout - NEVER hangs
function withStrictTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: T
): Promise<{ value: T; timedOut: boolean }> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ value: fallbackValue, timedOut: true }), ms)
  })

  return Promise.race([
    promise.then((value) => {
      clearTimeout(timeoutId)
      return { value, timedOut: false }
    }),
    timeoutPromise,
  ])
}

// Crypto health data type
interface CryptoHealthData {
  symbol: string
  healthPercentage: number
  status: "healthy" | "moderate" | "low" | "critical"
  hasRealData?: boolean
}

// User-friendly error messages for common HTTP status codes
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your input and try again.",
  401: "You need to be logged in to perform this action.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  408: "The request timed out. Please try again.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Server error. Please try again later or contact support.",
  502: "Service temporarily unavailable. Please try again.",
  503: "Service is under maintenance. Please try again later.",
  504: "Request timed out. Please try again.",
}

// Robust fetch with abort controller and better error messages
async function robustFetch<T>(
  url: string,
  options?: RequestInit,
  maxRetries = 2,
  timeoutMs = 6000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      // Try to parse JSON response even on error to get detailed error message
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        // Extract error message from response body if available
        const serverError = data?.error || data?.message
        const errorCode = data?.code || ""
        const msg = serverError || HTTP_ERROR_MESSAGES[response.status] || `Request failed (Error ${response.status})`
        // Attach code so catch block can use it without string matching
        const err = new Error(msg) as Error & { code?: string }
        err.code = errorCode
        throw err
      }

      return data as T
    } catch (error) {
      clearTimeout(timeout)

      if (error instanceof Error) {
        // Handle abort/timeout
        if (error.name === "AbortError") {
          lastError = new Error("Request timed out. Please check your connection and try again.")
        } else {
          lastError = error
        }
      } else {
        lastError = new Error(String(error))
      }

      // Don't retry if this was a deliberate server rejection (has error code)
      const hasCode = lastError && (lastError as any).code
      if (!hasCode && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      } else if (hasCode) {
        break
      }
    }
  }
  throw lastError || new Error("Request failed. Please try again.")
}

// SWR fetcher
const swrFetcher = async (url: string) => robustFetch(url, undefined, 2, 5000)
const pricesFetcher = (url: string) =>
  robustFetch<{ prices: Record<string, { price: number }> }>(url, undefined, 2, 5000)

// Detailed loading screen
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
              {hasError ? "Loading Issue Detected" : "Initializing Direct Faucet"}
            </CardTitle>
            <CardDescription>
              {hasError
                ? "Some components failed to load. Click retry to try again."
                : "Please wait while we prepare everything for you"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{Math.round(overallProgress)}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            <div className="space-y-3">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                >
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
                    {step.status === "cached" && (
                      <Zap className="w-5 h-5 text-blue-500" />
                    )}
                    {step.status === "error" && (
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                    )}
                    {step.status === "retrying" && (
                      <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${step.status === "success" || step.status === "cached"
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

                  <Badge
                    variant={
                      step.status === "success" || step.status === "cached"
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
                    {step.status === "cached" && "Cached"}
                    {step.status === "error" && "Failed"}
                    {step.status === "retrying" && "Retrying"}
                  </Badge>
                </div>
              ))}
            </div>

            {hasError && onRetry && (
              <Button onClick={onRetry} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry All Failed Steps
              </Button>
            )}

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

// Config error screen
function ConfigErrorScreen() {
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-md mx-auto">
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Database className="h-5 w-5" />
              Database Configuration Required
            </CardTitle>
            <CardDescription>
              The database connection is not properly configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please ensure the Supabase environment variables are set up correctly:
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-4">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            </ul>
            <div className="flex gap-3">
              <Button onClick={() => window.location.reload()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload Page
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
              Failed to Load Direct Faucet
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

// Rewarded bonus replacement: passive partner ads remain available below,
// while this payout CTA stays honest until server-side watch proof exists.
function WatchAdDoubleReward({ isAvailable }: { isAvailable: boolean }) {
  if (!isAvailable) return null
  return <RewardedAdsUnavailable compact className="mt-2" />
}

// Main faucet content - ULTRA ROBUST with state caching
function DirectFaucetContent() {
  const mountedRef = useRef(true)
  const initCountRef = useRef(0)

  // Device fingerprint context (loads in parallel via provider)
  const {
    fingerprint,
    isLoading: fingerprintLoading,
    deviceStatus,
  } = useDeviceFingerprintContext()

  // Page states
  const [pageReady, setPageReady] = useState(false)
  const [configError, setConfigError] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [fatalErrorDetails, setFatalErrorDetails] = useState<string | undefined>()
  const [showLoadingSteps, setShowLoadingSteps] = useState(true) // Show loading steps only on first load
  const [waitTimer, setWaitTimer] = useState(0) // Wait timer for subsequent loads
  const [isWaiting, setIsWaiting] = useState(false) // Whether we're in waiting mode

  // Loading steps
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([
    { id: "cache", label: "Checking Cache", status: "pending" },
    { id: "auth", label: "Authenticating User", status: "pending" },
    { id: "fingerprint", label: "Device Fingerprint", status: "pending" },
    { id: "profile", label: "Loading Profile", status: "pending" },
    { id: "ptc", label: "Checking PTC Status", status: "pending" },
    { id: "claims", label: "Loading Claim History", status: "pending" },
    { id: "security", label: "Security Checks", status: "pending" },
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

  // Crypto health states - for showing health on each crypto card
  const [cryptoHealthMap, setCryptoHealthMap] = useState<Record<string, CryptoHealthData>>({})

  // Security states
  const [vpnDetected, setVpnDetected] = useState(false)
  // Use the enterprise-grade adblock detection system already running in AdblockProvider
  // (wired into the dashboard layout). This replaces the custom per-page detection
  // which had false positives from self-triggered CSS checks.
  const { isFlagged: adblockDetected } = useAdblock()

  // Claim states
  const [isClaiming, setIsClaiming] = useState(false)
  const [selectedCrypto, setSelectedCrypto] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [isRefreshingPtc, setIsRefreshingPtc] = useState(false)

  // Crypto prices (SWR - loads independently)
  const { data: pricesData, error: pricesError, isLoading: pricesLoading } = useSWR<{
    prices: Record<string, { price: number }>
  }>("/api/crypto/prices", pricesFetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    errorRetryCount: 3,
    dedupingInterval: 30000,
    onSuccess: (data) => {
      // Validate we got actual price data
      if (data?.prices) {
        const priceCount = Object.keys(data.prices).length
        if (priceCount < 5) {
          console.warn("[v0] Fewer prices than expected:", priceCount)
        }
      }
    },
  })

  // Update step helper
  const updateStep = useCallback(
    (id: string, status: LoadingStep["status"], error?: string, retryCount?: number) => {
      if (!mountedRef.current) return
      setLoadingSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, error, retryCount } : s))
      )
    },
    []
  )

  // Overall progress
  const overallProgress = useMemo(() => {
    const completed = loadingSteps.filter(
      (s) => s.status === "success" || s.status === "cached"
    ).length
    return (completed / loadingSteps.length) * 100
  }, [loadingSteps])

  // Get the USD price for a crypto symbol
  const getCryptoPrice = useCallback(
    (symbol: string): number => {
      // Try API price first
      const apiPrice = pricesData?.prices?.[symbol]?.price
      if (apiPrice && apiPrice > 0) return apiPrice

      // Return zero when the live provider has no price; callers show unavailable state.
      return 0
    },
    [pricesData]
  )

  // Helper to format small numbers without scientific notation
  const formatSmallNumber = useCallback((num: number, maxDecimals: number = 10): string => {
    if (num === 0) return "0"

    // Avoid scientific notation by using toFixed with enough decimals
    // then trimming trailing zeros
    const fixed = num.toFixed(maxDecimals)

    // Remove trailing zeros but keep at least one decimal place for clarity
    const trimmed = fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

    // If the number is extremely small and all decimals are zeros, show a minimal representation
    if (trimmed === '0' && num > 0) {
      // Find first non-zero decimal position
      const str = num.toFixed(20)
      const match = str.match(/0\.(0*)([1-9])/)
      if (match) {
        const zeros = match[1].length
        const firstDigit = match[2]
        // Show as 0.000...001 format (max 10 decimals)
        if (zeros < 10) {
          return num.toFixed(zeros + 1)
        }
      }
      return `<0.${'0'.repeat(9)}1`
    }

    return trimmed
  }, [])

  // Get crypto amount based on price - ROBUST calculation
  const getCryptoAmount = useCallback(
    (symbol: string): string => {
      const price = getCryptoPrice(symbol)

      // Safety check - return formatted zero if no price
      if (!price || price <= 0) {
        return "0.00000000"
      }

      // Calculate: USD value / price per coin = amount of coins
      const amount = CLAIM_VALUE_USD / price

      // Format with appropriate decimals based on coin value - NO scientific notation
      if (price >= 1000) {
        // High value coins (BTC, ETH) - show more decimals
        return formatSmallNumber(amount, 10)
      } else if (price >= 1) {
        // Medium value coins - show 8 decimals
        return formatSmallNumber(amount, 8)
      } else {
        // Low value coins (DOGE, TRX, FEY) - might need fewer decimals
        return formatSmallNumber(amount, 8)
      }
    },
    [getCryptoPrice, formatSmallNumber]
  )

  // Format crypto amount for display (removes trailing zeros, no scientific notation)
  const formatCryptoAmount = useCallback(
    (symbol: string): string => {
      const amount = getCryptoAmount(symbol)
      const parsed = parseFloat(amount)
      if (parsed === 0) return "0"
      // Already formatted without scientific notation by getCryptoAmount
      return amount
    },
    [getCryptoAmount]
  )

  // PTC requirement constant - 3 ads required for manual faucet access
  const PTC_REQUIRED_COUNT = 3

  // Refresh PTC status handler - manually check if user has completed 3 PTC ads today
  const handleRefreshPtcStatus = useCallback(async () => {
    if (!user?.id) return

    setIsRefreshingPtc(true)

    // Set a timeout to prevent infinite spinning
    const timeoutId = setTimeout(() => {
      setIsRefreshingPtc(false)
      toast.error("Request timed out. Please try again.")
    }, 10000)

    try {
      // Clear cache to force fresh data
      safeStorage.clear()

      // Use fetch API to hit an endpoint for more reliable behavior
      const response = await fetch("/api/ptc/status", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error("Failed to fetch PTC status")
      }

      const data = await response.json()
      const newCount = data.completedToday || 0

      setPtcAdsCompleted(newCount)
      setIsLocked(newCount < PTC_REQUIRED_COUNT)

      // Update cache with new value
      safeStorage.set(CACHE_KEYS.PTC_COUNT, newCount)
      safeStorage.set(CACHE_KEYS.CACHE_TIME, Date.now())

      if (newCount >= PTC_REQUIRED_COUNT) {
        toast.success(`Unlocked! You have completed ${newCount} PTC ads today.`)
      } else {
        toast.info(`${newCount}/${PTC_REQUIRED_COUNT} PTC ads completed today. Watch ${PTC_REQUIRED_COUNT - newCount} more to unlock.`)
      }
    } catch (e) {
      clearTimeout(timeoutId)
      toast.error("Failed to check PTC status. Please refresh the page.")
    } finally {
      setIsRefreshingPtc(false)
    }
  }, [user?.id])

  // ULTRA ROBUST INITIALIZATION with caching
  const initialize = useCallback(async () => {
    if (!mountedRef.current) return

    const initId = ++initCountRef.current

    const now = Date.now()

    // Check if user has claimed before and still has active cooldown
    // Only show the wait timer if there is an actual active cooldown remaining
    const hasClaimedBefore = safePersistentStorage.get<boolean>(PERSISTENT_KEYS.HAS_CLAIMED_BEFORE)

    // We'll check for active cooldown after loading claims data below.
    // For now: if they've never claimed, skip the timer entirely.
    if (!hasClaimedBefore) {
      setShowLoadingSteps(true)
      setIsWaiting(false)
      setWaitTimer(0)
    } else {
      // Has claimed before — show loading steps silently, timer set later
      // if an active cooldown is found from claims data.
      setShowLoadingSteps(false)
      setIsWaiting(false)
    }

    // Reset states
    setPageReady(false)
    setFatalError(null)
    setFatalErrorDetails(undefined)
    setConfigError(false)
    setLoadingSteps((prev) =>
      prev.map((s) => ({ ...s, status: "pending", error: undefined }))
    )

    // PRE-CHECK: Verify Supabase is configured before doing anything
    if (!isSupabaseConfigured()) {
      if (mountedRef.current && initId === initCountRef.current) {
        setConfigError(true)
      }
      return
    }

    // STEP 1: Check cache first for instant load
    updateStep("cache", "loading")

    const cacheValid = isCacheValid()
    const cachedUser = safeStorage.get<any>(CACHE_KEYS.AUTH_USER)
    const cachedProfile = safeStorage.get<any>(CACHE_KEYS.PROFILE)
    const cachedPtcCount = safeStorage.get<number>(CACHE_KEYS.PTC_COUNT)
    const cachedClaimsData = safeStorage.get<any[]>(CACHE_KEYS.CLAIMS_DATA)

    if (cacheValid && cachedUser) {
      updateStep("cache", "cached")
      // Fast path - use cached data immediately
      setUser(cachedUser)
      if (cachedProfile) setProfile(cachedProfile)
      if (cachedPtcCount !== null) {
        setPtcAdsCompleted(cachedPtcCount)
        setIsLocked(cachedPtcCount < PTC_REQUIRED_COUNT)
      }
      if (cachedClaimsData) {
        const counts: Record<string, number> = {}
        let total = 0
        cachedClaimsData.forEach((claim: any) => {
          counts[claim.crypto_symbol] = (counts[claim.crypto_symbol] || 0) + 1
          total++
        })
        setClaimCounts(counts)
        setTotalClaims(total)
      }

      // Mark all steps as cached
      updateStep("auth", "cached")
      updateStep("profile", "cached")
      updateStep("ptc", "cached")
      updateStep("claims", "cached")
    } else {
      updateStep("cache", "success")
    }

    // STEP 2: Create Supabase client safely
    const supabase = createClient()

    // Verify client is usable - if null, config is missing
    if (!supabase) {
      if (mountedRef.current && initId === initCountRef.current) {
        setConfigError(true)
      }
      return
    }

    // STEP 3: Auth check with strict timeout
    // NOTE: authUser is declared here (outside the if-block) so it's accessible
    // after the block. We cannot rely on the `user` React state variable here
    // because setState is async and won't be updated within the same call.
    let authUser: any = null
    let serverProfile: any = null

    if (!cacheValid || !cachedUser) {
      updateStep("auth", "loading")

      try {
        // ROOT CAUSE FIX: clear any orphaned Web Lock before calling getUser().
        // @supabase/ssr uses navigator.locks to serialise auth operations. When
        // React Strict Mode double-mounts (or a navigation happens mid-request),
        // the lock is acquired but never released, causing getUser() to hang
        // forever. Stealing the lock unblocks the queue instantly.
        // See: https://github.com/supabase/supabase-js/issues/2111
        await clearOrphanedAuthLock()

        const { value: getUserResult, timedOut: getUserTimedOut } = await withStrictTimeout(
          supabase.auth.getUser(),
          5000,
          { data: { user: null }, error: null }
        )

        let user = getUserResult?.data?.user ?? null

        // If client-side auth failed or timed out, try the server API
        // This handles the case where cookies have the session but client doesn't
        if (!user) {
          try {
            const response = await fetch("/api/auth/me", {
              credentials: "include",
              cache: "no-store"
            })
            if (response.ok) {
              const data = await response.json()
              if (data.user) {
                user = data.user
                serverProfile = data.profile ?? null
              }
            }
          } catch {
            // API call failed, continue with null user
          }
        }

        if (!user) {
          if (mountedRef.current && initId === initCountRef.current) {
            updateStep("auth", "error", "Please log in to continue")
            setFatalError("Authentication required")
            setFatalErrorDetails("Please log in to access the Direct Faucet")
          }
          return
        }

        authUser = user
      } catch (err) {
        if (mountedRef.current && initId === initCountRef.current) {
          updateStep("auth", "error", "Please log in to continue")
          setFatalError("Authentication required")
          setFatalErrorDetails("Please log in to access the Direct Faucet")
        }
        return
      }

      if (!mountedRef.current || initId !== initCountRef.current) return

      setUser(authUser)
      safeStorage.set(CACHE_KEYS.AUTH_USER, authUser)
      safeStorage.set(CACHE_KEYS.CACHE_TIME, Date.now())
      updateStep("auth", "success")
    }

    // Get the user (either from cache or freshly authenticated).
    // IMPORTANT: use the local `authUser` variable — NOT the `user` React state,
    // which is still null here because setState is asynchronous.
    const currentUser = cachedUser || authUser
    if (!currentUser?.id) {
      if (mountedRef.current && initId === initCountRef.current) {
        updateStep("auth", "error", "User ID not found — please log in again")
        setFatalError("Authentication error")
        setFatalErrorDetails("Could not retrieve user information. Try refreshing or logging out and back in.")
      }
      return
    }

    // STEP 4: Fingerprint step (managed by context provider)
    if (!fingerprintLoading) {
      updateStep("fingerprint", "success")
    } else {
      updateStep("fingerprint", "loading")
    }

    // STEP 5-7: Load all data in PARALLEL (only if not cached)
    // Use UTC for consistent 24-hour reset across timezones
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // Start all parallel tasks
    if (!cacheValid) {
      updateStep("profile", "loading")
      updateStep("ptc", "loading")
      updateStep("claims", "loading")
    }
    updateStep("security", "loading")

    // Create parallel task promises
    const tasks: Promise<any>[] = []

    // Profile task - use serverProfile if already fetched from /api/auth/me
    if (!cacheValid || !cachedProfile) {
      if (serverProfile) {
        // Profile already fetched from server auth API, skip DB call
        tasks.push(Promise.resolve({ type: "profile", data: serverProfile, error: null }))
      } else {
        tasks.push(
          (async () => {
            try {
              const { value, timedOut } = await withStrictTimeout(
                supabase!.from("profiles").select("*").eq("id", currentUser.id).single(),
                5000,
                { data: null, error: null }
              )
              if (timedOut) throw new Error("Timeout")
              return { type: "profile", data: value.data, error: value.error }
            } catch (err) {
              return { type: "profile", data: null, error: err }
            }
          })()
        )
      }
    }

    // PTC status task - fetch actual count of completed PTC ads today
    // PTC always re-fetched — never trust cache (user may have just completed ads)
    tasks.push(
      (async () => {
        try {
          const { value, timedOut } = await withStrictTimeout(
            supabase!
              .from("ptc_views")
              .select("*", { count: "exact", head: true })
              .eq("user_id", currentUser.id)
              .eq("completed", true)
              .gte("created_at", todayISO),
            5000,
            { count: 0, error: null }
          )
          if (timedOut) throw new Error("Timeout")
          return { type: "ptc", count: value.count || 0, error: value.error }
        } catch (err) {
          return { type: "ptc", count: 0, error: err }
        }
      })()
    )

    // Claims task
    if (!cacheValid || !cachedClaimsData) {
      tasks.push(
        (async () => {
          try {
            const { value, timedOut } = await withStrictTimeout(
              supabase!
                .from("manual_faucet_claims")
                .select("crypto_symbol, claimed_at")
                .eq("user_id", currentUser.id)
                .gte("claimed_at", todayISO)
                .order("claimed_at", { ascending: false }),
              5000,
              { data: [], error: null }
            )
            if (timedOut) throw new Error("Timeout")
            return { type: "claims", data: value.data || [], error: value.error }
          } catch (err) {
            return { type: "claims", data: [], error: err }
          }
        })()
      )
    }

    // VPN check task (always run)
    tasks.push(
      (async () => {
        try {
          const response = await robustFetch<{ isAllowed: boolean }>(
            "/api/security/vpn-check",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                timezone:
                  typeof Intl !== "undefined"
                    ? Intl.DateTimeFormat().resolvedOptions().timeZone
                    : "Unknown",
                language: typeof navigator !== "undefined" ? navigator.language : "en",
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
              }),
            },
            2,
            4000
          )
          return { type: "vpn", isAllowed: response.isAllowed }
        } catch {
          // Allow on error
          return { type: "vpn", isAllowed: true }
        }
      })()
    )

    // Shortlink check task
    tasks.push(
      (async () => {
        try {
          const { value, timedOut } = await withStrictTimeout(
            supabase!
              .from("shortlink_views")
              .select("viewed_at")
              .eq("user_id", currentUser.id)
              .gte("viewed_at", todayISO)
              .order("viewed_at", { ascending: false })
              .limit(1),
            4000,
            { data: [], error: null }
          )
          if (timedOut) return { type: "shortlink", data: [] }
          return { type: "shortlink", data: value.data || [] }
        } catch {
          return { type: "shortlink", data: [] }
        }
      })()
    )

    // Adblock detection is handled by the enterprise AdblockProvider in the dashboard layout.

    // Wait for all tasks with a global timeout
    const { value: results, timedOut: globalTimeout } = await withStrictTimeout(
      Promise.allSettled(tasks),
      12000,
      []
    )

    if (!mountedRef.current || initId !== initCountRef.current) return

    if (globalTimeout) {
      // Even on global timeout, show the page with whatever we have
      console.warn("[v0] Global timeout reached, showing page with partial data")
    }

    // Process results
    let profileData = cachedProfile
    let ptcCount = cachedPtcCount ?? 0
    let claimsData = cachedClaimsData ?? []
    let shortlinkData: any[] = []
    let vpnAllowed = true


    for (const result of results) {
      if (result.status === "fulfilled") {
        const value = result.value as any
        switch (value.type) {
          case "profile":
            if (value.data) {
              profileData = value.data
              safeStorage.set(CACHE_KEYS.PROFILE, profileData)
            }
            updateStep("profile", value.error && !value.data ? "error" : "success")
            break
          case "ptc":
            // Always use fresh PTC count — this fixes the stale-cache unlock issue
            ptcCount = value.count ?? 0
            safeStorage.set(CACHE_KEYS.PTC_COUNT, ptcCount)
            // Immediately update UI so lock state reflects reality
            if (mountedRef.current) {
              setPtcAdsCompleted(ptcCount)
              setIsLocked(ptcCount < PTC_REQUIRED_COUNT)
            }
            updateStep("ptc", value.error ? "error" : "success")
            break
          case "claims":
            claimsData = value.data ?? []
            safeStorage.set(CACHE_KEYS.CLAIMS_DATA, claimsData)
            updateStep("claims", value.error ? "error" : "success")
            break
          case "vpn":
            vpnAllowed = value.isAllowed ?? true
            break
          case "shortlink":
            shortlinkData = value.data ?? []
            break

        }
      }
    }

    // Mark security check complete
    updateStep("security", "success")

    // Apply all data
    if (mountedRef.current && initId === initCountRef.current) {
      setProfile(profileData)
      setPtcAdsCompleted(ptcCount)
      setIsLocked(ptcCount < PTC_REQUIRED_COUNT)
      setVpnDetected(!vpnAllowed)


      // Process claims
      const counts: Record<string, number> = {}
      let total = 0
      claimsData.forEach((claim: any) => {
        counts[claim.crypto_symbol] = (counts[claim.crypto_symbol] || 0) + 1
        total++
      })
      setClaimCounts(counts)
      setTotalClaims(total)

      // Calculate cooldowns
      const newCooldowns: Record<string, number> = {}
      const now = Date.now()
      claimsData.forEach((claim: any) => {
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
        const lastClaimTime = claimsData[0]?.claimed_at
        const lastShortlinkTime = shortlinkData[0]?.viewed_at
        if (!lastShortlinkTime || new Date(lastShortlinkTime) < new Date(lastClaimTime)) {
          setShortlinkRequired(true)
        }
      }

      // PAGE READY!
      setPageReady(true)
      safeStorage.set(SESSION_KEYS.LAST_VISIT_TIME, Date.now())

      // After loading claims, start the countdown timer if there is an active cooldown
      // (any coin on cooldown means the user has claimed recently)
      const activeCooldown = Object.values(newCooldowns).find(v => v > 0)
      if (activeCooldown && activeCooldown > 0) {
        setIsWaiting(true)
        setWaitTimer(activeCooldown)
      }
    }
  }, [updateStep, user, fingerprintLoading])

  // Sync fingerprint loading state
  useEffect(() => {
    if (fingerprintLoading) {
      updateStep("fingerprint", "loading")
    } else {
      updateStep("fingerprint", "success")
    }
  }, [fingerprintLoading, updateStep])

  // Fetch crypto health data for showing on each crypto card
  useEffect(() => {
    async function fetchCryptoHealth() {
      try {
        const response = await fetch("/api/faucet-health/crypto")
        if (response.ok) {
          const data = await response.json()
          if (data.cryptos) {
            const healthMap: Record<string, CryptoHealthData> = {}
            for (const crypto of data.cryptos) {
              healthMap[crypto.symbol] = {
                symbol: crypto.symbol,
                healthPercentage: crypto.healthPercentage,
                status: crypto.status,
                hasRealData: crypto.hasRealData
              }
            }
            setCryptoHealthMap(healthMap)
          }
        }
      } catch {
        // Silently fail - health data is optional
      }
    }

    // Fetch immediately and then every 60 seconds
    fetchCryptoHealth()
    const interval = setInterval(fetchCryptoHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true
    initialize()
    return () => {
      mountedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for PTC completion broadcast from the PTC page.
  // When the user completes a PTC ad in another tab/same tab, this fires
  // and immediately re-checks PTC status so the faucet unlocks automatically.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    let bc: BroadcastChannel
    try {
      bc = new BroadcastChannel("ptc_completed")
      bc.onmessage = () => {
        // Clear PTC cache so next check re-fetches
        try {
          sessionStorage.removeItem("mf_ptc_count_v1")
          sessionStorage.removeItem("mf_cache_time_v1")
        } catch { }
        // Re-fetch PTC status immediately
        handleRefreshPtcStatus()
      }
    } catch { /* ignore */ }
    return () => { try { bc?.close() } catch { } }
  }, [handleRefreshPtcStatus])

  // Cooldown timer
  useEffect(() => {
    if (!pageReady) return

    const interval = setInterval(() => {
      setCooldowns((prev) => {
        const next = { ...prev }
        let changed = false
        Object.keys(next).forEach((key) => {
          if (next[key] > 0) {
            next[key]--
            changed = true
            if (next[key] === 0) delete next[key]
          }
        })
        return changed ? next : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [pageReady])

  // Wait timer countdown (post-claim cooldown display)
  useEffect(() => {
    if (!isWaiting || waitTimer <= 0) return
    const id = setInterval(() => {
      setWaitTimer(prev => {
        if (prev <= 1) {
          clearInterval(id)
          setIsWaiting(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isWaiting]) // eslint-disable-line react-hooks/exhaustive-deps

  // Verification handlers
  const handleVerificationComplete = useCallback((token: string) => {
    setVerificationToken(token)
    setIsVerified(true)
    toast.success("Verification complete!", { description: "You can now claim rewards" })
  }, [])

  const handleVerificationFail = useCallback((reason: string) => {
    toast.error("Verification failed", { description: reason })
    setIsVerified(false)
    setVerificationToken(null)
  }, [])

  // Claim handler
  const handleClaim = useCallback(
    async (symbol: string) => {
      if (isClaiming || !user || !verificationToken) return
      if (cooldowns[symbol] && cooldowns[symbol] > 0) return
      if (shortlinkRequired) {
        toast.error("Shortlink Required", {
          description: "Please complete 1 shortlink to continue",
        })
        return
      }
      if (vpnDetected) {
        toast.error("VPN/Proxy detected", {
          description: "Please disable your VPN to claim.",
        })
        return
      }
      if (adblockDetected) {
        toast.error("AdBlock Detected", {
          description: "Please disable your ad blocker.",
        })
        return
      }
      if (deviceStatus === "blocked") {
        toast.error("Device Blocked", {
          description: "This device has been flagged.",
        })
        return
      }

      setIsClaiming(true)
      setSelectedCrypto(symbol)

      try {
        const response = await robustFetch<{ amount: string; error?: string; code?: string }>(
          "/api/manual-faucet/claim",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cryptoSymbol: symbol,
              captchaToken: verificationToken,
              fingerprint,
            }),
          },
          2,
          12000
        )

        if (response.error) {
          const err = new Error(response.error) as Error & { code?: string }
          if (response.code) err.code = response.code
          throw err
        }

        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 },
            colors: ["#00D4FF", "#10B981", "#F59E0B"],
          })
        } catch { }

        toast.success(`Claimed ${response.amount} ${symbol}!`, {
          description: "Sent to your FaucetPay account",
        })

        setCooldowns((prev) => ({ ...prev, [symbol]: COOLDOWN_SECONDS }))
        setClaimCounts((prev) => ({ ...prev, [symbol]: (prev[symbol] || 0) + 1 }))
        setTotalClaims((prev) => {
          const newTotal = prev + 1
          if (newTotal > 0 && newTotal % SHORTLINK_REQUIRED_AFTER === 0) {
            setShortlinkRequired(true)
          }
          return newTotal
        })

        // Mark that user has made their first claim — subsequent page loads show timer
        safePersistentStorage.set(PERSISTENT_KEYS.HAS_CLAIMED_BEFORE, true)

        // Start the 45s wait timer display
        setIsWaiting(true)
        setWaitTimer(COOLDOWN_SECONDS)

        // Invalidate cache after claim
        safeStorage.clear()

        setIsVerified(false)
        setVerificationToken(null)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to claim"
        console.error("[v0] Claim error:", errorMessage)

        // Provide helpful context based on error type with clear actions
        let title = "Claim Failed"
        let description = errorMessage
        let actionHint = ""

        const errorCode = (error as any)?.code || ""
        if (errorCode === "FAUCETPAY_NOT_CONFIGURED" ||
          errorMessage.toLowerCase().includes("link your faucetpay") ||
          errorMessage.toLowerCase().includes("faucetpay email") ||
          errorMessage.toLowerCase().includes("account settings") ||
          errorMessage.toLowerCase().includes("not configured") ||
          errorMessage.toLowerCase().includes("faucetpay_not_configured")) {
          title = "FaucetPay Email Required"
          description = "Please add your FaucetPay email address in Settings."
          actionHint = "Click Settings (top-right) > Payment Settings > FaucetPay Withdrawal."
        } else if (errorMessage.toLowerCase().includes("not registered") || errorMessage.includes("456")) {
          title = "FaucetPay Account Not Found"
          description = "Your email is not registered on FaucetPay."
          actionHint = "Create a free FaucetPay account with the same email first."
        } else if (errorMessage.includes("funds") || errorMessage.includes("Insufficient") || errorMessage.includes("402") || errorMessage.includes("out of funds")) {
          title = "Faucet Has Insufficient Funds"
          description = "This faucet doesn\'t have sufficient funds to complete your transaction right now."
          actionHint = "Please try again later — the faucet is refilled periodically."
        } else if (errorMessage.includes("limit") || errorMessage.includes("458")) {
          title = "Daily Limit Reached"
          description = "You've reached your daily claim limit."
          actionHint = "Try again tomorrow!"
        } else if (errorMessage.includes("timed out") || errorMessage.includes("connection") || errorMessage.includes("network")) {
          title = "Connection Error"
          description = "Could not connect to the server."
          actionHint = "Check your internet and try again."
        } else if (errorMessage.includes("profile") || errorMessage.includes("Profile")) {
          title = "Profile Error"
          description = "Could not load your profile."
          actionHint = "Try refreshing the page."
        } else if (errorMessage.includes("suspended") || errorMessage.includes("460")) {
          title = "Account Suspended"
          description = "Your FaucetPay account is suspended."
          actionHint = "Contact FaucetPay support for help."
        } else if (errorMessage.includes("currency") || errorMessage.includes("461")) {
          title = "Currency Not Linked"
          description = `Your FaucetPay account cannot receive ${symbol}.`
          actionHint = "Enable this currency in your FaucetPay wallet settings."
        }

        toast.error(title, {
          description: actionHint ? `${description} ${actionHint}` : description,
          duration: 6000,
        })
      } finally {
        setIsClaiming(false)
        setSelectedCrypto(null)
      }
    },
    [
      isClaiming,
      user,
      verificationToken,
      cooldowns,
      shortlinkRequired,
      vpnDetected,
      adblockDetected,
      deviceStatus,
      fingerprint,
    ]
  )

  // Retry handler
  const handleRetry = useCallback(() => {
    safeStorage.clear()
    initialize()
  }, [initialize])

  // Render config error
  if (configError) {
    return <ConfigErrorScreen />
  }

  // Render loading or wait timer
  // Show cooldown timer after a successful claim while page is ready
  // This must be AFTER pageReady check so it doesn't block the loading screen
  if (pageReady && isWaiting) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Partner Ads - Top (3x 60s static) */}
          <MultiNetworkAds position="header" layout="grid" priority="high" lazyLoad={false} />

          <Card className="border-primary/20">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-3">
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
              <CardTitle className="text-lg">Cooldown Active</CardTitle>
              <CardDescription className="text-sm">
                Your last claim was processed. Wait for the timer to claim again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="text-center">
                <div className="text-5xl font-bold text-primary mb-1 tabular-nums">{waitTimer}</div>
                <p className="text-xs text-muted-foreground">seconds remaining</p>
              </div>
              <Progress value={((COOLDOWN_SECONDS - waitTimer) / COOLDOWN_SECONDS) * 100} className="h-2" />
              <p className="text-center text-xs text-muted-foreground">
                You can claim again in {waitTimer}s. You may also browse other earning methods.
              </p>
            </CardContent>
          </Card>

          {/* 11 Ad Networks - Grid */}
          <MultiNetworkAds position="content" layout="grid" showLabels={false} priority="high" />

          {/* Partner Ads - Bottom */}
          <div className="h-6" aria-hidden="true" />
          <MultiNetworkAds position="footer" layout="grid" priority="high" lazyLoad={false} />
        </div>
      </div>
    )
  }

  if (!pageReady && !fatalError) {
    // Loading screen shown below

    // Show detailed loading steps on first load
    return (
      <DetailedLoadingScreen
        steps={loadingSteps}
        overallProgress={overallProgress}
        onRetry={handleRetry}
      />
    )
  }

  // Render fatal error
  if (fatalError) {
    return <ErrorState error={fatalError} details={fatalErrorDetails} onRetry={handleRetry} />
  }

  // MAIN CONTENT
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 mb-4">
              <Coins className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Direct Crypto Faucet</h1>
            <p className="text-muted-foreground">
              Claim small amounts of crypto every 60 seconds - sent directly to FaucetPay
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

        {/* Health indicators are now shown under each crypto in the grid below */}

        {/* Partner Ads - 3x 60s static (separated from other networks per policy) */}
        <MultiNetworkAds position="header" layout="grid" className="mb-4" />

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
                    4000
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
                Please disable your ad blocker to claim rewards.
              </p>
              <p className="text-sm text-muted-foreground">
                After disabling, refresh the page to continue.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {deviceStatus === "flagged" && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Device Under Review</AlertTitle>
            <AlertDescription>
              Unusual activity detected. Some features may be restricted.
            </AlertDescription>
          </Alert>
        )}

        {deviceStatus === "blocked" && (
          <Alert variant="destructive">
            <Lock className="h-4 w-4" />
            <AlertTitle>Device Blocked</AlertTitle>
            <AlertDescription>
              This device has been flagged. Claiming is disabled.
            </AlertDescription>
          </Alert>
        )}

        {/* Locked State */}
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
                    <span className="font-bold text-amber-500">{PTC_REQUIRED_COUNT} PTC Ads</span> to unlock
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={(ptcAdsCompleted / PTC_REQUIRED_COUNT) * 100} className="w-48 h-2" />
                  <span className="text-sm font-medium">{ptcAdsCompleted}/{PTC_REQUIRED_COUNT}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild className="gap-2 bg-amber-500 hover:bg-amber-600">
                    <Link href="/dashboard/ptc">
                      <Play className="h-4 w-4" />
                      Watch PTC Ads
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={isRefreshingPtc}
                    onClick={handleRefreshPtcStatus}
                  >
                    {isRefreshingPtc ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isRefreshingPtc ? "Checking..." : "Refresh Status"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Already watched PTC ads? Click "Refresh Status" to update your progress.
                  <br />
                  <span className="text-amber-500">PTC requirement resets every 24 hours.</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shortlink Required */}
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
                must be completed!
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

        {/* Verification */}
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
                const cryptoAmount = formatCryptoAmount(crypto.symbol)
                const rawAmount = getCryptoAmount(crypto.symbol)
                const price = getCryptoPrice(crypto.symbol)
                const cooldown = cooldowns[crypto.symbol] || 0
                const claimCount = claimCounts[crypto.symbol] || 0
                const isOnCooldown = cooldown > 0
                const isCurrentlyProcessing = isClaiming && selectedCrypto === crypto.symbol
                const hasPriceData = price > 0
                const health = cryptoHealthMap[crypto.symbol]
                const healthColor = health?.status === "healthy" ? "bg-green-500" :
                  health?.status === "moderate" ? "bg-yellow-500" :
                    health?.status === "low" ? "bg-orange-500" :
                      health?.status === "critical" ? "bg-red-500" : "bg-muted"

                return (
                  <Card
                    key={crypto.symbol}
                    className={`relative overflow-hidden transition-all duration-200 ${isOnCooldown
                      ? "opacity-60 border-muted"
                      : "hover:border-primary/50 hover:shadow-lg cursor-pointer"
                      }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          <CryptoIcon symbol={crypto.symbol} size="md" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">{crypto.symbol}</p>
                          <p className="text-xs text-muted-foreground">{crypto.name}</p>
                        </div>
                        {/* Health indicator badge */}
                        {health && health.hasRealData !== false && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5",
                              health.status === "healthy" && "text-green-500 border-green-500/30",
                              health.status === "moderate" && "text-yellow-500 border-yellow-500/30",
                              health.status === "low" && "text-orange-500 border-orange-500/30",
                              health.status === "critical" && "text-red-500 border-red-500/30"
                            )}
                          >
                            {health.healthPercentage}%
                          </Badge>
                        )}
                      </div>

                      {/* Health Progress Bar */}
                      {health && (
                        <div className="mb-3">
                          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                            {health.hasRealData === false ? (
                              <div className="h-full w-full bg-muted-foreground/20 animate-pulse" />
                            ) : (
                              <div
                                className={cn("h-full transition-all duration-500", healthColor)}
                                style={{ width: `${health.healthPercentage}%` }}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {/* Crypto Amount - PRIMARY DISPLAY */}
                        <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">You receive:</span>
                            {hasPriceData && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                Live
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="font-mono font-bold text-base text-primary">
                              {cryptoAmount}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {crypto.symbol}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            = $0.0009 USD
                          </div>
                        </div>

                        {/* Price Info */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Price:</span>
                          <span className="font-mono">
                            ${price >= 1 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : price.toFixed(6)}
                          </span>
                        </div>

                        {/* Claims Count */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Your claims:</span>
                          <span className="font-medium">{claimCount}</span>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-3 gap-2"
                        disabled={isOnCooldown || isClaiming || !hasPriceData}
                        onClick={() => handleClaim(crypto.symbol)}
                      >
                        {isCurrentlyProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Claiming...
                          </>
                        ) : isOnCooldown ? (
                          <>
                            <Clock className="h-4 w-4" />
                            {cooldown}s
                          </>
                        ) : !hasPriceData ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            Claim {cryptoAmount}
                          </>
                        )}
                      </Button>

                      {/* Rewarded bonus status */}
                      <WatchAdDoubleReward
                        isAvailable={!isOnCooldown && hasPriceData && claimCount > 0}
                      />
                    </CardContent>

                    {isOnCooldown && (
                      <div
                        className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-1000"
                        style={{
                          width: `${((COOLDOWN_SECONDS - cooldown) / COOLDOWN_SECONDS) * 100}%`,
                        }}
                      />
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Info */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li>Complete 3 PTC ads daily to unlock the direct faucet</li>
              <li>Complete verification to prove you are human</li>
              <li>Claim from any cryptocurrency every 60 seconds (1 minute per coin)</li>
              <li>
                After {SHORTLINK_REQUIRED_AFTER} claims, complete 1 shortlink to continue
              </li>
              <li>All rewards are sent directly to your FaucetPay account</li>
            </ul>
          </CardContent>
        </Card>

        {/* Spacer to separate Google Ads from other networks per policy */}
        <div className="h-8" aria-hidden="true" />

        {/* Other 11 Ad Networks - auto-refreshing (except AdsKeeper which only refreshes on page load) */}
        <MultiNetworkAds position="footer" layout="grid" showLabels={false} />

        {/* Bottom Partner Ads */}
        <div className="h-8" aria-hidden="true" />
        <MultiNetworkAds position="footer" layout="grid" />
      </div>
    </div>
  )
}

// Main export with Suspense
export default function DirectFaucetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading Direct Faucet...</p>
          </div>
        </div>
      }
    >
      <DirectFaucetContent />
    </Suspense>
  )
}
