"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Shield, AlertTriangle, Loader2, RefreshCw, Ban } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generatePersistentFingerprint, type PersistentFingerprintResult } from "@/lib/security/persistent-fingerprint"

interface AuthSecurityGuardProps {
  children: React.ReactNode
  isSignup?: boolean
  onSecurityCheck?: (result: SecurityCheckResult) => void
  /**
   * Receives the in-flight check promise so the parent can AWAIT it on submit
   * rather than rejecting with "Please wait for security verification".
   */
  onCheckStarted?: (promise: Promise<void>) => void
}

export interface SecurityCheckResult {
  isAllowed: boolean
  fingerprint: string | null
  vpnDetected: boolean
  multiAccountBlocked: boolean
  flagReason?: string
  requiresAdditionalVerification: boolean
}

interface CheckState {
  status: "checking" | "allowed" | "blocked" | "warning"
  message?: string
  details?: string
}

/**
 * Auth Security Guard Component
 * 
 * Wraps auth pages (login/signup) to:
 * 1. Check for VPN/Proxy usage
 * 2. Check for multi-account abuse
 * 3. Generate persistent fingerprint
 * 4. Block or warn based on security checks
 * 
 * Zero false positives - only blocks with high confidence
 */
export function AuthSecurityGuard({
  children,
  isSignup = false,
  onSecurityCheck,
  onCheckStarted
}: AuthSecurityGuardProps) {
  const [checkState, setCheckState] = useState<CheckState>({ status: "checking" })
  const [fingerprint, setFingerprint] = useState<PersistentFingerprintResult | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // PERF (T1): these MUST be refs, not state, and must NOT appear in
  // performSecurityCheck's dependency array.
  //
  // The previous version listed `fingerprint?.fingerprint` in the deps of the
  // useCallback (line 171) while the callback itself called
  // setFingerprint(fpResult) near its start. So: run -> setState -> new
  // callback identity -> the useEffect that depends on that identity fires
  // again -> the ENTIRE check runs a second time. That doubled the slowest
  // thing on the login critical path: a full persistent-fingerprint pass
  // (5 sequential storage awaits) plus the /api/security/multi-account-check
  // round trip (which itself runs VPN Fortress against up to 18 external APIs).
  const fingerprintRef = useRef<PersistentFingerprintResult | null>(null)
  const hasRunRef = useRef(false)
  // Exposed to the parent so a submit can await the in-flight check instead of
  // being rejected outright when it hasn't finished yet.
  const inFlightRef = useRef<Promise<void> | null>(null)

  const performSecurityCheck = useCallback(async () => {
    setCheckState({ status: "checking" })

    try {
      // Step 1: Generate persistent fingerprint
      const fpResult = await generatePersistentFingerprint()
      fingerprintRef.current = fpResult
      setFingerprint(fpResult)

      // Step 2: Call server-side multi-account check with VPN detection.
      // The route itself now bounds its VPN-fortress work to ~3.5s (see
      // lib/security/vpn-fortress.ts), but this call had no client-side
      // timeout at all — a hung upstream (proxy, DNS, dropped connection)
      // could leave the login/signup form stuck on "Verifying your
      // connection..." forever, since nothing here would ever reject.
      // 6s gives the server call room to finish and still fails safely.
      const response = await fetch("/api/security/multi-account-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: fpResult.fingerprint,
          isSignup,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(6000),
      })

      if (!response.ok) {
        // On API error, allow but log
        console.warn("[AuthSecurityGuard] API error, allowing by default")
        setCheckState({ status: "allowed" })
        onSecurityCheck?.({
          isAllowed: true,
          fingerprint: fpResult.fingerprint,
          vpnDetected: false,
          multiAccountBlocked: false,
          requiresAdditionalVerification: false,
        })
        return
      }

      const result = await response.json()

      if (!result.isAllowed) {
        // Blocked
        setCheckState({
          status: "blocked",
          message: result.flagReason || "Access denied for security reasons.",
          details: result.vpnDetected
            ? "VPN or proxy connection detected. Please disable to continue."
            : undefined,
        })
        onSecurityCheck?.({
          isAllowed: false,
          fingerprint: fpResult.fingerprint,
          vpnDetected: result.vpnDetected || false,
          multiAccountBlocked: result.existingAccounts > 0,
          flagReason: result.flagReason,
          requiresAdditionalVerification: false,
        })
        return
      }

      // HARDENED: VPN detection now blocks completely, not just warns
      if (result.vpnDetected) {
        // Block - VPN/Proxy detected
        setCheckState({
          status: "blocked",
          message: "VPN or proxy connection detected.",
          details: "Please disable your VPN, proxy, or Tor connection to continue. Only direct internet connections are allowed.",
        })
        onSecurityCheck?.({
          isAllowed: false,
          fingerprint: fpResult.fingerprint,
          vpnDetected: true,
          multiAccountBlocked: false,
          flagReason: "VPN or proxy detected. Please disable to continue.",
          requiresAdditionalVerification: false,
        })
        return
      }

      if (result.requiresAdditionalVerification) {
        // Warning - requires additional verification but not VPN
        setCheckState({
          status: "warning",
          message: "Additional verification may be required.",
        })
        onSecurityCheck?.({
          isAllowed: true,
          fingerprint: fpResult.fingerprint,
          vpnDetected: false,
          multiAccountBlocked: false,
          requiresAdditionalVerification: true,
        })
        return
      }

      // All clear
      setCheckState({ status: "allowed" })
      onSecurityCheck?.({
        isAllowed: true,
        fingerprint: fpResult.fingerprint,
        vpnDetected: false,
        multiAccountBlocked: false,
        requiresAdditionalVerification: false,
      })
    } catch (error) {
      console.error("[AuthSecurityGuard] Check failed:", error)
      // On error, allow but flag
      setCheckState({ status: "allowed" })
      onSecurityCheck?.({
        isAllowed: true,
        fingerprint: fingerprintRef.current?.fingerprint || null,
        vpnDetected: false,
        multiAccountBlocked: false,
        requiresAdditionalVerification: false,
      })
    }
    // deps: `fingerprint` is intentionally ABSENT — it is read through
    // fingerprintRef above. Including it recreated this callback on every
    // setFingerprint() and re-ran the whole check (see the ref comment above).
  }, [isSignup, onSecurityCheck])

  useEffect(() => {
    // Run exactly once per mount. React 19 StrictMode double-invokes effects in
    // development, and the check is expensive + has server-side side effects
    // (it writes fraud/attempt records), so it must be idempotent per mount.
    if (hasRunRef.current) return
    hasRunRef.current = true
    const promise = performSecurityCheck()
    inFlightRef.current = promise
    onCheckStarted?.(promise)
    void promise
  }, [performSecurityCheck, onCheckStarted])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    // Re-arm the once-per-mount guard: an explicit user retry is a new attempt.
    hasRunRef.current = true
    const promise = performSecurityCheck()
    inFlightRef.current = promise
    onCheckStarted?.(promise)
    void promise
  }

  // PERF (T2): the "checking" state no longer REPLACES the form.
  //
  // Previously this returned a standalone spinner, so the sign-in form did not
  // exist in the DOM until the fingerprint pass and the multi-account/VPN round
  // trip had both finished — several seconds during which the user could not
  // even read the page, let alone start typing. Security is unchanged: the
  // parent gates SUBMISSION on the verdict (it awaits the in-flight promise via
  // onCheckStarted), and the "blocked" state below is still a hard stop.
  if (checkState.status === "checking") {
    return (
      <div className="w-full max-w-md space-y-2">
        <div
          className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" aria-hidden="true" />
          <Shield className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
          <span>Verifying your connection…</span>
        </div>
        {children}
      </div>
    )
  }

  // Show blocked state
  if (checkState.status === "blocked") {
    return (
      <Card className="w-full max-w-md border-destructive/50 bg-destructive/5">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 p-3 rounded-full bg-destructive/10 w-fit">
            <Ban className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl text-destructive">Access Blocked</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive" className="border-destructive/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">{checkState.message}</p>
              {checkState.details && (
                <p className="text-sm opacity-80">{checkState.details}</p>
              )}
            </AlertDescription>
          </Alert>

          <div className="text-center text-xs text-muted-foreground space-y-2">
            <p>
              If you believe this is an error, please disable any VPN, proxy, or Tor
              connection and try again.
            </p>
            <p>
              For assistance, contact support with reference code:{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {fingerprint?.fingerprint?.substring(0, 8) || "N/A"}
              </code>
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRetry}
            className="w-full gap-2"
            disabled={retryCount >= 3}
          >
            <RefreshCw className="h-4 w-4" />
            {retryCount >= 3 ? "Too many attempts" : "Re-check Connection"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Show warning state (VPN detected but allowed)
  if (checkState.status === "warning") {
    return (
      <div className="space-y-4">
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            <p className="font-medium">{checkState.message}</p>
            <p className="text-sm mt-1 opacity-80">
              For the best experience, consider using a direct internet connection.
            </p>
          </AlertDescription>
        </Alert>
        {children}
      </div>
    )
  }

  // Allowed - render children
  return <>{children}</>
}

/**
 * Hook to get the fingerprint from AuthSecurityGuard context
 */
export function useAuthFingerprint(): string | null {
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  useEffect(() => {
    generatePersistentFingerprint()
      .then(result => setFingerprint(result.fingerprint))
      .catch(() => setFingerprint(null))
  }, [])

  return fingerprint
}
