"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogoFull } from "@/components/icons/logo"
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mail, Fingerprint, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useTranslations } from "@/hooks/use-translations"
import { TwoFactorVerify } from "@/components/auth/two-factor-verify"
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

export default function LoginPage() {
  const { t, isReady } = useTranslations({ namespaces: ["auth", "common"] })

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("")
  const [securityCheckResult, setSecurityCheckResult] = useState<SecurityCheckResult | null>(null)
  const [vpnBlocked, setVpnBlocked] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isManualLogin, setIsManualLogin] = useState(false)
  const [supabaseAvailable, setSupabaseAvailable] = useState(true)
  const [show2FA, setShow2FA] = useState(false)
  const [pending2FAUserId, setPending2FAUserId] = useState<string | null>(null)
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/dashboard"
  const message = searchParams.get("message")

  useEffect(() => {
    const supabase = createClient()

    if (!supabase) {
      console.warn("[Login] Supabase client not available")
      setSupabaseAvailable(false)
      setIsCheckingSession(false)
      return
    }

    const checkSession = async () => {
      try {
        // Clear orphaned Web Lock before auth operation to prevent hangs
        await clearOrphanedAuthLock()

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.user) {
          router.replace(redirect)
          return
        }
      } catch (err) {
        console.warn("Session check failed:", err)
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user && !isManualLogin) {
        toast.success("Welcome back!")
        window.location.href = redirect
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [redirect, router, isManualLogin])

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
    generatePersistentFingerprint()
      .then((result: PersistentFingerprintResult) => setDeviceFingerprint(result.fingerprint))
      .catch(console.error)
  }, [])

  const handleSecurityCheck = useCallback((result: SecurityCheckResult) => {
    setSecurityCheckResult(result)
    if (result.fingerprint) {
      setDeviceFingerprint(result.fingerprint)
    }
    // Block if not allowed OR if VPN detected (hardened security)
    if (!result.isAllowed || result.vpnDetected) {
      setVpnBlocked(true)
      if (result.vpnDetected) {
        setError("VPN or proxy detected. Please disable to sign in.")
      }
    }
  }, [])

  useEffect(() => {
    if (message === "password-reset") {
      toast.success("Password reset successfully. Please sign in with your new password.")
    }
  }, [message])

  const isGmailAddress = (email: string): boolean => {
    const emailLower = email.toLowerCase().trim()
    return emailLower.endsWith("@gmail.com")
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

  const handleGoogleSignIn = async () => {
    // SECURITY: Block login if VPN detected
    if (vpnBlocked) {
      setError("VPN or proxy detected. Please disable your VPN/proxy to sign in.")
      return
    }

    // SECURITY: Require security check to complete
    if (!securityCheckResult) {
      setError("Please wait for security verification to complete.")
      return
    }

    // SECURITY: Block if security check didn't allow
    if (!securityCheckResult.isAllowed) {
      setError(securityCheckResult.flagReason || "Sign in blocked for security reasons.")
      return
    }

    if (isOffline) {
      setError("You appear to be offline. Please check your internet connection.")
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
      callbackUrl.searchParams.set("next", redirect)
      if (deviceFingerprint) {
        callbackUrl.searchParams.set("fingerprint", deviceFingerprint)
      }

      // Block multi-account: Use "consent" instead of "select_account" to prevent account chooser
      // This forces re-authorization without showing other Google accounts
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (error) {
        console.error("Google OAuth error:", error)
        if (error.message.includes("provider is not enabled")) {
          setError("Google sign-in is not yet enabled. Please use email/password or contact support.")
        } else if (error.message.includes("fetch") || error.message.includes("network")) {
          setError("Unable to connect to authentication service. Please check your connection and try again.")
        } else {
          setError(error.message)
        }
        setIsGoogleLoading(false)
      }
    } catch (err) {
      console.error("Google sign-in error:", err)
      setError("Unable to connect to authentication service. Please check your internet connection and try again.")
      setIsGoogleLoading(false)
    }
  }

  const completeLoginAfter2FA = async () => {
    if (!pendingCredentials) return

    const supabase = createClient()
    if (!supabase) return

    try {
      // Re-authenticate with stored credentials
      const { error } = await supabase.auth.signInWithPassword({
        email: pendingCredentials.email,
        password: pendingCredentials.password,
      })

      if (error) {
        setError("Session expired. Please login again.")
        setShow2FA(false)
        setPendingCredentials(null)
        setPending2FAUserId(null)
        return
      }

      if (deviceFingerprint) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          await supabase.from("device_fingerprints").upsert(
            {
              user_id: user.id,
              fingerprint_hash: deviceFingerprint,
              last_seen_at: new Date().toISOString(),
              times_seen: 1,
              is_trusted: true,
            },
            { onConflict: "user_id,fingerprint_hash" },
          )
        }
      }

      toast.success("Welcome back!")
      window.location.href = redirect
    } catch (err) {
      console.error("Login completion error:", err)
      setError("Failed to complete login. Please try again.")
      setShow2FA(false)
      setPendingCredentials(null)
      setPending2FAUserId(null)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    // SECURITY: Block login if VPN detected
    if (vpnBlocked) {
      setError("VPN or proxy detected. Please disable your VPN/proxy to sign in.")
      return
    }

    // SECURITY: Require security check to complete
    if (!securityCheckResult) {
      setError("Please wait for security verification to complete.")
      return
    }

    // SECURITY: Block if security check didn't allow
    if (!securityCheckResult.isAllowed) {
      setError(securityCheckResult.flagReason || "Sign in blocked for security reasons.")
      return
    }

    if (isOffline) {
      setError("You appear to be offline. Please check your internet connection.")
      return
    }

    if (!isGmailAddress(email)) {
      setError("Only Gmail addresses (@gmail.com) are allowed for security reasons.")
      return
    }

    const supabase = createClient()
    if (!supabase) {
      setError("Authentication service is temporarily unavailable. Please try again later.")
      return
    }

    setIsLoading(true)
    setError(null)
    setIsManualLogin(true)

    try {
      const twoFACheck = await fetch("/api/2fa/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      })

      // Attempt login first to validate credentials
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      })

      if (signInError) {
        setIsManualLogin(false)
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please try again.")
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please verify your email before signing in. Check your inbox.")
        } else if (signInError.message.includes("fetch")) {
          setError("Unable to connect to authentication service. Please try again later.")
        } else {
          setError(signInError.message)
        }
        return
      }

      // If 2FA is enabled, sign out and show 2FA verification
      if (twoFACheck.ok) {
        const twoFAData = await twoFACheck.json()
        if (twoFAData.requires2FA && signInData.user) {
          // Sign out temporarily until 2FA is verified
          await supabase.auth.signOut()
          setPending2FAUserId(signInData.user.id)
          setPendingCredentials({ email: email.toLowerCase().trim(), password })
          setShow2FA(true)
          setIsLoading(false)
          return
        }
      }

      // No 2FA, proceed with login
      if (deviceFingerprint && signInData.user) {
        await supabase.from("device_fingerprints").upsert(
          {
            user_id: signInData.user.id,
            fingerprint_hash: deviceFingerprint,
            last_seen_at: new Date().toISOString(),
            times_seen: 1,
            is_trusted: true,
          },
          { onConflict: "user_id,fingerprint_hash" },
        )
      }

      toast.success("Welcome back!")
      window.location.href = redirect
    } catch (err) {
      console.error("Login error:", err)
      setIsManualLogin(false)
      setError("Unable to connect to authentication service. Please check your internet connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (show2FA && pending2FAUserId) {
    return (
      <TwoFactorVerify
        userId={pending2FAUserId}
        onSuccess={completeLoginAfter2FA}
        onCancel={() => {
          setShow2FA(false)
          setPending2FAUserId(null)
          setPendingCredentials(null)
        }}
      />
    )
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">{t("checkingSession", "common")}</p>
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

      <AuthSecurityGuard isSignup={false} onSecurityCheck={handleSecurityCheck}>
        <Card className="w-full max-w-md border-border/30 bg-gradient-to-b from-card to-card/95 backdrop-blur-xl shadow-2xl shadow-primary/5">
          <CardHeader className="text-center px-5 sm:px-6 pt-6 sm:pt-8">
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">{t("loginTitle", "auth")}</CardTitle>
            <CardDescription className="text-sm mt-1.5">{t("loginSubtitle", "auth")}</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
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

            {message === "verified" && (
              <Alert className="mb-4 border-accent bg-accent/10">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <AlertDescription className="text-sm text-accent">{t("emailVerifiedSuccess", "auth")}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full mb-4 h-10 sm:h-11 bg-transparent text-sm sm:text-base hover:bg-muted/50 transition-colors"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading || isOffline}
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  <span className="text-sm">{t("connectingGoogle", "auth")}</span>
                </>
              ) : (
                <>
                  <GoogleIcon className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  <span>{t("googleSignIn", "auth")}</span>
                </>
              )}
            </Button>

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

            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2.5 sm:p-3 text-xs text-muted-foreground">
              <Fingerprint className="h-4 w-4 text-accent flex-shrink-0" />
              <span>{t("deviceTracking", "auth")}</span>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
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
                  aria-describedby={error ? "login-error" : undefined}
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
                {email && !isGmailAddress(email) && (
                  <p className="text-xs text-destructive">{t("gmailOnlyError", "auth")}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm">
                    {t("password", "auth")}
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs sm:text-sm text-primary hover:underline focus:outline-none focus-visible:underline"
                  >
                    {t("forgotPassword", "auth")}
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("enterPassword", "auth")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading || isOffline}
                    autoComplete="current-password"
                    className="pr-10 h-10 sm:h-11 text-sm sm:text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:text-foreground"
                    aria-label={showPassword ? t("hidePassword", "auth") : t("showPassword", "auth")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold"
                disabled={isLoading || isOffline || !email || !password}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{t("signingIn", "auth")}</span>
                  </>
                ) : (
                  t("signIn", "auth")
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">{t("noAccount", "auth")} </span>
              <Link href="/auth/sign-up" className="text-primary hover:underline font-medium">
                {t("signUp", "auth")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthSecurityGuard>
    </div>
  )
}
