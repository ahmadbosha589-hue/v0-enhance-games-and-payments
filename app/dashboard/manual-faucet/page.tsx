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
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
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

const CLAIM_VALUE_USD = 0.0001
const COOLDOWN_SECONDS = 7
const SHORTLINK_REQUIRED_AFTER = 100

// Cache keys for session storage
const CACHE_KEYS = {
  AUTH_USER: "mf_auth_user_v1",
  PROFILE: "mf_profile_v1",
  PTC_COUNT: "mf_ptc_count_v1",
  CLAIMS_DATA: "mf_claims_data_v1",
  CACHE_TIME: "mf_cache_time_v1",
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

// Safe sessionStorage helper
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

// Robust fetch with abort controller
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      clearTimeout(timeout)
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
  throw lastError || new Error("Fetch failed")
}

// SWR fetcher
const swrFetcher = async (url: string) => robustFetch(url, undefined, 2, 5000)

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
              {hasError ? "Loading Issue Detected" : "Initializing Manual Faucet"}
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

// Main faucet content - ULTRA ROBUST with state caching
function ManualFaucetContent() {
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

  // Security states
  const [vpnDetected, setVpnDetected] = useState(false)
  const [adblockDetected, setAdblockDetected] = useState(false)

  // Claim states
  const [isClaiming, setIsClaiming] = useState(false)
  const [selectedCrypto, setSelectedCrypto] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)

  // Crypto prices (SWR - loads independently)
  const { data: pricesData } = useSWR<{
    prices: Record<string, { price: number }>
  }>("/api/crypto/prices", swrFetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    errorRetryCount: 2,
    dedupingInterval: 30000,
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

  // Get crypto amount based on price
  const getCryptoAmount = useCallback(
    (symbol: string) => {
      const price = pricesData?.prices?.[symbol]?.price
      if (!price || price === 0) return "0.00000000"
      const amount = CLAIM_VALUE_USD / price
      return amount.toFixed(8)
    },
    [pricesData]
  )

  // ULTRA ROBUST INITIALIZATION with caching
  const initialize = useCallback(async () => {
    if (!mountedRef.current) return

    const initId = ++initCountRef.current

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
        setIsLocked(cachedPtcCount < 2)
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

    if (!cacheValid || !cachedUser) {
      updateStep("auth", "loading")

      let authAttempts = 0
      const maxAttempts = 3

      while (!authUser && authAttempts < maxAttempts) {
        authAttempts++
        if (authAttempts > 1) {
          updateStep("auth", "retrying", undefined, authAttempts)
        }

        try {
          // Use Promise wrapper to ensure we can timeout
          const authPromise = new Promise<{ data: { user: any }; error: any }>(
            async (resolve) => {
              try {
                const result = await supabase.auth.getUser()
                resolve(result)
              } catch (err) {
                resolve({ data: { user: null }, error: err })
              }
            }
          )

          const { value: authResult, timedOut } = await withStrictTimeout(
            authPromise,
            5000,
            { data: { user: null }, error: new Error("Timeout") }
          )

          if (timedOut) {
            throw new Error("Authentication timed out")
          }

          if (authResult.error) {
            throw authResult.error
          }

          if (!authResult.data.user) {
            // Try getSession as a fallback — with a strict timeout so a slow
            // token-refresh network call never causes the page to hang forever.
            const sessionRaced = await Promise.race([
              supabase.auth.getSession(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
            ])
            const sessionUser = (sessionRaced as any)?.data?.session?.user ?? null
            if (sessionUser) {
              authUser = sessionUser
            } else {
              throw new Error("Not authenticated")
            }
          } else {
            authUser = authResult.data.user
          }
        } catch (err) {
          if (authAttempts >= maxAttempts) {
            if (mountedRef.current && initId === initCountRef.current) {
              updateStep("auth", "error", "Please log in to continue")
              setFatalError("Authentication required")
              setFatalErrorDetails("Please log in to access the Manual Faucet")
            }
            return
          }
          await new Promise((r) => setTimeout(r, 300 * authAttempts))
        }
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)
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

    // Profile task
    if (!cacheValid || !cachedProfile) {
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

    // PTC status task
    if (!cacheValid || cachedPtcCount === null) {
      tasks.push(
        (async () => {
          try {
            const { value, timedOut } = await withStrictTimeout(
              supabase!
                .from("ptc_views")
                .select("*", { count: "exact", head: true })
                .eq("user_id", currentUser.id)
                .eq("completed", true)
                .gte("viewed_at", todayISO),
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
    }

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

    // Adblock check task
    tasks.push(
      (async () => {
        try {
          if (typeof document === "undefined") return { type: "adblock", detected: false }
          const bait = document.createElement("div")
          bait.className = "adsbox ad-banner pub_300x250"
          bait.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;"
          document.body.appendChild(bait)
          await new Promise((r) => setTimeout(r, 80))
          const isHidden =
            bait.offsetParent === null ||
            bait.offsetHeight === 0 ||
            getComputedStyle(bait).display === "none"
          try {
            document.body.removeChild(bait)
          } catch { }
          return { type: "adblock", detected: isHidden }
        } catch {
          return { type: "adblock", detected: false }
        }
      })()
    )

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
    let adblockIsDetected = false

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
            ptcCount = value.count ?? 0
            safeStorage.set(CACHE_KEYS.PTC_COUNT, ptcCount)
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
          case "adblock":
            adblockIsDetected = value.detected ?? false
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
      setIsLocked(ptcCount < 2)
      setVpnDetected(!vpnAllowed)
      setAdblockDetected(adblockIsDetected)

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

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true
    initialize()
    return () => {
      mountedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        const response = await robustFetch<{ amount: string; error?: string }>(
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

        if (response.error) throw new Error(response.error)

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

        // Invalidate cache after claim
        safeStorage.clear()

        setIsVerified(false)
        setVerificationToken(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to claim")
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

  // Render loading
  if (!pageReady && !fatalError) {
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
                    <span className="font-bold text-amber-500">2 PTC Ads</span> to unlock
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
                const amount = getCryptoAmount(crypto.symbol)
                const cooldown = cooldowns[crypto.symbol] || 0
                const claimCount = claimCounts[crypto.symbol] || 0
                const isOnCooldown = cooldown > 0
                const isCurrentlyProcessing = isClaiming && selectedCrypto === crypto.symbol

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
                          <CryptoIcon symbol={crypto.symbol} size={24} />
                        </div>
                        <div>
                          <p className="font-semibold">{crypto.symbol}</p>
                          <p className="text-xs text-muted-foreground">{crypto.name}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-mono font-medium">{amount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Claims:</span>
                          <span className="font-medium">{claimCount}</span>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-3 gap-2"
                        disabled={isOnCooldown || isClaiming}
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
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            Claim
                          </>
                        )}
                      </Button>
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
              <li>Complete 2 PTC ads daily to unlock the manual faucet</li>
              <li>Complete verification to prove you are human</li>
              <li>Claim from any cryptocurrency every {COOLDOWN_SECONDS} seconds</li>
              <li>
                After {SHORTLINK_REQUIRED_AFTER} claims, complete 1 shortlink to continue
              </li>
              <li>All rewards are sent directly to your FaucetPay account</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Main export with Suspense
export default function ManualFaucetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading Manual Faucet...</p>
          </div>
        </div>
      }
    >
      <ManualFaucetContent />
    </Suspense>
  )
}