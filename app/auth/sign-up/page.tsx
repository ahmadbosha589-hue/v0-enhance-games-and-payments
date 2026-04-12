"use client"

import type React from "react"
import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { LogoFull } from "@/components/icons/logo"
import { Eye, EyeOff, Loader2, Gift, AlertCircle, Check, X, Mail, Lock, Fingerprint, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useTranslations } from "@/hooks/use-translations"
import { generatePersistentFingerprint, type PersistentFingerprintResult } from "@/lib/security/persistent-fingerprint"
import { AuthSecurityGuard, type SecurityCheckResult } from "@/components/auth/auth-security-guard"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

const passwordRequirements_ = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Contains lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Contains a number", test: (p: string) => /[0-9]/.test(p) },
]

export default function SignUpPage() {
  const { t, isReady } = useTranslations({ namespaces: ["auth", "common"] })

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("")
  const [securityCheckResult, setSecurityCheckResult] = useState<SecurityCheckResult | null>(null)
  const [signupBlocked, setSignupBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [supabaseAvailable, setSupabaseAvailable] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)

  const urlReferralCode = searchParams.get("ref") || searchParams.get("referral") || ""
  const [referralCode, setReferralCode] = useState(urlReferralCode)
  const [isReferralFromUrl, setIsReferralFromUrl] = useState(false)
  const [isValidatingReferral, setIsValidatingReferral] = useState(false)
  const [referralValid, setReferralValid] = useState<boolean | null>(null)
  const [referrerName, setReferrerName] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    if (!supabase) {
      console.warn("[SignUp] Supabase client not available")
      setSupabaseAvailable(false)
      setIsCheckingSession(false)
      return
    }

    let redirecting = false

    const checkSession = async () => {
      try {
        // Clear orphaned Web Lock before auth operation to prevent hangs
        await clearOrphanedAuthLock()

        // First try getSession (reads from localStorage, fast)
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user) {
          console.log("[SignUp] Session found, redirecting to dashboard")
          redirecting = true
          window.location.href = "/dashboard"
          return
        }

        // Also check with getUser in case OAuth just completed
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          console.log("[SignUp] User found via getUser, redirecting to dashboard")
          redirecting = true
          window.location.href = "/dashboard"
          return
        }
      } catch (err) {
        console.warn("[SignUp] Session check failed:", err)
      } finally {
        if (!redirecting) {
          setIsCheckingSession(false)
        }
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[SignUp] Auth state change:", event, !!session?.user)

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user && !redirecting) {
        console.log("[SignUp] Auth state SIGNED_IN, redirecting...")
        redirecting = true
        toast.success("Account created successfully!")
        window.location.href = "/dashboard"
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    setIsOffline(!navigator.onLine)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    if (urlReferralCode) {
      setReferralCode(urlReferralCode)
      setIsReferralFromUrl(true)
      validateReferralCode(urlReferralCode)
    }
  }, [urlReferralCode])

  const validateReferralCode = async (code: string) => {
    if (!code || code.length < 6) {
      setReferralValid(null)
      setReferrerName(null)
      return
    }

    setIsValidatingReferral(true)
    try {
      const response = await fetch(`/api/referrals/validate?code=${encodeURIComponent(code)}`)
      const data = await response.json()

      if (data.valid) {
        setReferralValid(true)
        setReferrerName(data.referrerName || null)
      } else {
        setReferralValid(false)
        setReferrerName(null)
      }
    } catch {
      setReferralValid(null)
      setReferrerName(null)
    } finally {
      setIsValidatingReferral(false)
    }
  }

  useEffect(() => {
    if (isReferralFromUrl) return

    const timer = setTimeout(() => {
      if (referralCode && referralCode.length >= 6) {
        validateReferralCode(referralCode)
      } else {
        setReferralValid(null)
        setReferrerName(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [referralCode, isReferralFromUrl])

  useEffect(() => {
    generatePersistentFingerprint()
      .then((result: PersistentFingerprintResult) => setDeviceFingerprint(result.fingerprint))
      .catch(console.error)
  }, [])

  const handleSecurityCheck = useCallback((result: SecurityCheckResult) => {
    setSecurityCheckResult(result)
    if (result.fingerprint) {
      setDeviceFingerprint(result.fingerprint)
    }
    if (!result.isAllowed) {
      setSignupBlocked(true)
      setBlockReason(result.flagReason || "Access denied for security reasons.")
    }
  }, [])

  const passwordStrength = useMemo(() => {
    const passed = passwordRequirements_.filter((req) => req.test(password)).length
    return (passed / passwordRequirements_.length) * 100
  }, [password])

  const getStrengthColor = (strength: number) => {
    if (strength < 25) return "bg-destructive"
    if (strength < 50) return "bg-orange-500"
    if (strength < 75) return "bg-yellow-500"
    return "bg-accent"
  }

  const getStrengthLabel = (strength: number) => {
    if (strength < 25) return "Weak"
    if (strength < 50) return "Fair"
    if (strength < 75) return "Good"
    return "Strong"
  }

  const isGmailAddress = (email: string): boolean => {
    const emailLower = email.toLowerCase().trim()
    return emailLower.endsWith("@gmail.com")
  }

  const handleGoogleSignUp = async () => {
    if (isOffline) {
      setError("You appear to be offline. Please check your internet connection.")
      return
    }

    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.")
      return
    }

    const supabase = createClient()
    if (!supabase) {
      setError("Authentication service is temporarily unavailable. Please try again later.")
      return
    }

    setIsGoogleLoading(true)
    setError(null)

    try {
      const baseRedirectUrl = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin
      const callbackUrl = new URL("/auth/callback", baseRedirectUrl)
      callbackUrl.searchParams.set("next", "/dashboard")
      callbackUrl.searchParams.set("type", "signup")
      if (deviceFingerprint) {
        callbackUrl.searchParams.set("fingerprint", deviceFingerprint)
      }
      if (referralCode && referralValid) {
        callbackUrl.searchParams.set("ref", referralCode)
      }

      // Use "select_account" to allow Google account selection while still
      // remembering the last logged in account. This provides:
      // 1. Fast sign-in for returning users (account is pre-selected)
      // 2. Ability to switch accounts if needed
      // Security is maintained through VPN blocking, fingerprinting, and fraud detection
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      })

      if (error) {
        console.error("Google OAuth error:", error)
        if (error.message.includes("provider is not enabled")) {
          setError("Google sign-up is not yet enabled. Please use email/password registration.")
        } else if (error.message.includes("fetch") || error.message.includes("network")) {
          setError("Unable to connect to authentication service. Please check your connection.")
        } else {
          setError(error.message)
        }
        setIsGoogleLoading(false)
      }
    } catch (err) {
      console.error("Google sign-up error:", err)
      setError("Unable to connect to authentication service. Please try again.")
      setIsGoogleLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isOffline) {
      setError("You appear to be offline. Please check your internet connection.")
      return
    }

    if (!isGmailAddress(email)) {
      setError("Only Gmail addresses (@gmail.com) are allowed for security reasons.")
      return
    }

    const failedRequirements = passwordRequirements_.filter((req) => !req.test(password))
    if (failedRequirements.length > 0) {
      setError(failedRequirements[0].label)
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.")
      return
    }

    const supabase = createClient()
    if (!supabase) {
      setError("Authentication service is temporarily unavailable. Please try again later.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
          data: {
            referred_by: referralCode && referralValid !== false ? referralCode : null,
            device_fingerprint: deviceFingerprint,
            signup_ip: null,
          },
        },
      })

      if (error) {
        if (error.message.includes("already registered")) {
          setError("An account with this email already exists. Try signing in instead.")
        } else if (error.message.includes("fetch")) {
          setError("Unable to connect to authentication service. Please try again later.")
        } else {
          setError(error.message)
        }
        return
      }

      // If user is created and session exists, log them in directly
      if (signUpData?.user && signUpData?.session) {
        // Store device fingerprint for the new user
        if (deviceFingerprint) {
          await supabase.from("device_fingerprints").upsert(
            {
              user_id: signUpData.user.id,
              fingerprint_hash: deviceFingerprint,
              last_seen_at: new Date().toISOString(),
              times_seen: 1,
              is_trusted: true,
            },
            { onConflict: "user_id,fingerprint_hash" },
          )
        }

        toast.success("Account created successfully! Welcome!")
        window.location.href = "/dashboard"
        return
      }

      // If email confirmation is required (no session), redirect to verify page
      router.push("/auth/verify-email")
    } catch (err) {
      console.error("Sign-up error:", err)
      setError("Unable to connect to authentication service. Please check your internet connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const retryConnection = useCallback(async () => {
    setIsRetrying(true)
    setError(null)

    try {
      const supabase = createClient()
      if (!supabase) {
        setSupabaseAvailable(false)
        setError("Authentication service is not configured. Please try again later.")
        return
      }

      // Clear orphaned Web Lock before auth operation
      await clearOrphanedAuthLock()

      await supabase.auth.getSession()
      setRetryCount(0)
      setSupabaseAvailable(true)
      toast.success("Connection restored!")
    } catch (err) {
      setRetryCount((prev) => prev + 1)
      setError("Still unable to connect. Please try again later.")
    } finally {
      setIsRetrying(false)
    }
  }, [])

  // Updated error messages and loading text to use translations
  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">{t("loading", "common")}</p>
      </div>
    )
  }

  if (!supabaseAvailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="mb-6 sm:mb-8">
          <Link href="/" aria-label="Go to homepage">
            <LogoFull size="lg" />
          </Link>
        </div>
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl sm:text-2xl">{t("serviceUnavailable", "common")}</CardTitle>
            <CardDescription>{t("authServiceConfiguring", "auth")}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t("authServiceSetup", "auth")}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("tryAgain", "common")}
            </Button>
            <div className="mt-4">
              <Link href="/" className="text-sm text-primary hover:underline">
                {t("returnHome", "common")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/4 top-1/4 h-[300px] w-[300px] sm:h-[400px] sm:w-[400px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-[200px] w-[200px] sm:h-[300px] sm:w-[300px] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="mb-6 sm:mb-8">
        <Link href="/" aria-label="Go to homepage">
          <LogoFull size="lg" />
        </Link>
      </div>

      <AuthSecurityGuard isSignup={true} onSecurityCheck={handleSecurityCheck}>
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-xl sm:text-2xl">{t("signupTitle", "auth")}</CardTitle>
            <CardDescription className="text-sm">{t("signupSubtitle", "auth")}</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {referralCode && isReferralFromUrl && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-lg border p-2.5 sm:p-3 text-xs sm:text-sm ${referralValid === true
                  ? "border-accent/30 bg-accent/10"
                  : referralValid === false
                    ? "border-destructive/30 bg-destructive/10"
                    : "border-accent/20 bg-accent/10"
                  }`}
                role="status"
              >
                <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <Gift
                  className={`h-4 w-4 flex-shrink-0 ${referralValid === true ? "text-accent" : referralValid === false ? "text-destructive" : "text-accent"}`}
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0">
                  {isValidatingReferral ? (
                    t("validating", "common")
                  ) : referralValid === true ? (
                    <>
                      {t("referredBy", "auth")}{" "}
                      <strong className="text-accent">{referrerName || t("aFriend", "auth")}</strong>
                    </>
                  ) : referralValid === false ? (
                    <span className="text-destructive">{t("invalidReferral", "auth")}</span>
                  ) : (
                    <>
                      {t("code", "common")}: <strong className="text-accent">{referralCode}</strong>
                    </>
                  )}
                </span>
                {referralValid === true && <Check className="h-4 w-4 text-accent flex-shrink-0" />}
                {referralValid === false && <X className="h-4 w-4 text-destructive flex-shrink-0" />}
              </div>
            )}

            {isOffline && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{t("offlineMessage", "common")}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm flex items-center justify-between gap-2">
                  <span className="flex-1">{error}</span>
                  {error.includes("connect") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={retryConnection}
                      disabled={isRetrying}
                      className="ml-2 h-6 px-2 flex-shrink-0"
                    >
                      {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 p-2.5 sm:p-3 text-xs sm:text-sm">
                <Gift className="h-4 w-4 text-accent flex-shrink-0" />
                <span>{t("signupBonus", "auth")}</span>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 sm:h-11 bg-transparent text-sm sm:text-base hover:bg-muted/50 transition-colors"
                    onClick={handleGoogleSignUp}
                    disabled={isGoogleLoading || isLoading || isOffline || !acceptedTerms}
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        <span className="text-sm">{t("connectingGoogle", "auth")}</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        <span>{t("googleSignUp", "auth")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </TooltipTrigger>
              {!acceptedTerms && (
                <TooltipContent side="top" className="max-w-[250px] text-center">
                  {t("acceptTermsForGoogle", "auth", "Please accept the Terms of Service and Privacy Policy to enable Google Sign-up")}
                </TooltipContent>
              )}
            </Tooltip>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t("orContinueWith", "auth")}</span>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 sm:p-3 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 text-primary flex-shrink-0" />
              <span>{t("gmailOnly", "auth")}</span>
            </div>

            {/* Removed redundant Shield icon alert */}

            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2.5 sm:p-3 text-xs text-muted-foreground">
              <Fingerprint className="h-4 w-4 text-accent flex-shrink-0" />
              <span>{t("deviceTracking", "auth")}</span>
            </div>

            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  {t("email", "auth")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || isOffline}
                  autoComplete="email"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
                {email && !isGmailAddress(email) && (
                  <p className="text-xs text-destructive">{t("gmailOnlyError", "auth")}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">
                  {t("password", "auth")}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("createPassword", "auth")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading || isOffline}
                    autoComplete="new-password"
                    className="pr-10 h-10 sm:h-11 text-sm sm:text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t("hidePassword", "auth") : t("showPassword", "auth")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {password && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t("passwordStrength", "auth")}:</span>
                      <span className={passwordStrength === 100 ? "text-accent" : "text-muted-foreground"}>
                        {getStrengthLabel(passwordStrength)}
                      </span>
                    </div>
                    <Progress value={passwordStrength} className={`h-1.5 ${getStrengthColor(passwordStrength)}`} />
                    <ul className="grid grid-cols-2 gap-1 text-xs">
                      {passwordRequirements_.map((req, index) => (
                        <li
                          key={index}
                          className={`flex items-center gap-1 ${req.test(password) ? "text-accent" : "text-muted-foreground"}`}
                        >
                          {req.test(password) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {req.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm">
                  {t("confirmPassword", "auth")}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("confirmYourPassword", "auth")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading || isOffline}
                  autoComplete="new-password"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">{t("passwordMismatch", "auth")}</p>
                )}
              </div>

              {!isReferralFromUrl && (
                <div className="space-y-2">
                  <Label htmlFor="referral" className="text-sm">
                    {t("referralCode", "auth")} ({t("optional", "common")})
                  </Label>
                  <div className="relative">
                    <Input
                      id="referral"
                      type="text"
                      placeholder={t("enterReferralCode", "auth")}
                      value={referralCode}
                      onChange={(e) => {
                        setReferralCode(e.target.value.toUpperCase())
                        setIsReferralFromUrl(false)
                      }}
                      disabled={isLoading || isOffline}
                      className="h-10 sm:h-11 text-sm sm:text-base pr-8"
                    />
                    {isValidatingReferral && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!isValidatingReferral && referralValid === true && (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                    )}
                    {!isValidatingReferral && referralValid === false && (
                      <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                    )}
                  </div>
                  {referralValid === true && referrerName && (
                    <p className="text-xs text-accent">
                      {t("referredBy", "auth")} {referrerName}
                    </p>
                  )}
                  {referralValid === false && <p className="text-xs text-destructive">{t("invalidReferral", "auth")}</p>}
                </div>
              )}

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  disabled={isLoading || isOffline}
                />
                <label htmlFor="terms" className="text-xs sm:text-sm text-muted-foreground leading-tight cursor-pointer">
                  {t("iAgreeToThe", "auth")}{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    {t("termsOfService", "auth")}
                  </Link>{" "}
                  {t("and", "auth")}{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    {t("privacyPolicy", "auth")}
                  </Link>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full h-10 sm:h-11 text-sm sm:text-base"
                disabled={
                  isLoading ||
                  isGoogleLoading ||
                  isOffline ||
                  !acceptedTerms ||
                  (email.length > 0 && !isGmailAddress(email)) ||
                  passwordStrength < 100 ||
                  password !== confirmPassword
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    {t("signingUp", "auth")}
                  </>
                ) : (
                  t("createAccount", "auth")
                )}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs sm:text-sm text-muted-foreground">
              {t("hasAccount", "auth")}{" "}
              <Link href="/auth/login" className="text-primary hover:underline">
                {t("signIn", "auth")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </AuthSecurityGuard>
    </div>
  )
}
