"use client"

import { useState, useEffect, useCallback } from "react"
import { Shield, AlertTriangle, Loader2, RefreshCw, Ban } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generatePersistentFingerprint, type PersistentFingerprintResult } from "@/lib/security/persistent-fingerprint"

interface AuthSecurityGuardProps {
  children: React.ReactNode
  isSignup?: boolean
  onSecurityCheck?: (result: SecurityCheckResult) => void
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
  onSecurityCheck 
}: AuthSecurityGuardProps) {
  const [checkState, setCheckState] = useState<CheckState>({ status: "checking" })
  const [fingerprint, setFingerprint] = useState<PersistentFingerprintResult | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const performSecurityCheck = useCallback(async () => {
    setCheckState({ status: "checking" })

    try {
      // Step 1: Generate persistent fingerprint
      const fpResult = await generatePersistentFingerprint()
      setFingerprint(fpResult)

      // Step 2: Call server-side multi-account check with VPN detection
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

      if (result.vpnDetected || result.requiresAdditionalVerification) {
        // Warning - VPN detected but allowed
        setCheckState({
          status: "warning",
          message: result.vpnDetected 
            ? "VPN/Proxy detected. Some features may be restricted."
            : "Additional verification may be required.",
        })
        onSecurityCheck?.({
          isAllowed: true,
          fingerprint: fpResult.fingerprint,
          vpnDetected: result.vpnDetected || false,
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
        fingerprint: fingerprint?.fingerprint || null,
        vpnDetected: false,
        multiAccountBlocked: false,
        requiresAdditionalVerification: false,
      })
    }
  }, [isSignup, onSecurityCheck, fingerprint?.fingerprint])

  useEffect(() => {
    performSecurityCheck()
  }, [performSecurityCheck])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    performSecurityCheck()
  }

  // Show checking state
  if (checkState.status === "checking") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative p-4 rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Security Check
          </p>
          <p className="text-xs text-muted-foreground">Verifying your connection...</p>
        </div>
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
