"use client"

import { Shield, AlertTriangle, Loader2, RefreshCw, ShieldAlert, Globe, Fingerprint } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { usePersistentVPNCheck } from "@/hooks/use-persistent-vpn-check"
import { useEffect, useState, useCallback } from "react"
import { generatePersistentFingerprint } from "@/lib/security/persistent-fingerprint"

interface OfferwallVPNGuardProps {
  children: React.ReactNode
  /** Stricter mode for offerwalls - lower threshold for blocking */
  strictMode?: boolean
}

export function OfferwallVPNGuard({ children, strictMode = true }: OfferwallVPNGuardProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [multiAccountDetected, setMultiAccountDetected] = useState(false)
  const [isCheckingMultiAccount, setIsCheckingMultiAccount] = useState(true)
  
  const { vpnDetected, isChecking, lastResult, recheck } = usePersistentVPNCheck({
    intervalMs: 15000, // Check every 15 seconds for offerwalls
    checkOnVisibilityChange: true,
    checkOnNetworkChange: true,
  })

  // Check for multi-account abuse on mount
  useEffect(() => {
    const checkMultiAccount = async () => {
      try {
        const fp = await generatePersistentFingerprint()
        setFingerprint(fp.fingerprint)
        
        // Verify with server
        const response = await fetch("/api/security/multi-account-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fingerprint: fp.fingerprint,
            signals: fp.signals,
            context: "offerwall",
          }),
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.isMultiAccount) {
            setMultiAccountDetected(true)
          }
        }
      } catch (error) {
        console.error("Multi-account check failed:", error)
      } finally {
        setIsCheckingMultiAccount(false)
      }
    }
    
    checkMultiAccount()
  }, [])

  // For strict mode, also block on high risk scores even without definitive VPN detection
  const isBlocked = vpnDetected || (strictMode && lastResult && lastResult.riskScore >= 65)

  // Show loading state on initial checks
  if ((!lastResult && isChecking) || isCheckingMultiAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative p-4 rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Security Verification
          </p>
          <p className="text-xs text-muted-foreground">
            {isCheckingMultiAccount ? "Verifying account integrity..." : "Checking your connection..."}
          </p>
        </div>
      </div>
    )
  }

  // Multi-account abuse detected
  if (multiAccountDetected) {
    return (
      <div className="space-y-4 py-8">
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <ShieldAlert className="h-5 w-5" />
          <AlertDescription className="space-y-3">
            <div>
              <p className="font-semibold text-base">Multiple Accounts Detected</p>
              <p className="text-sm mt-1">
                We have detected that this device has been used with multiple accounts. 
                Offerwall access is restricted to one account per device.
              </p>
            </div>
            <div className="text-xs space-y-1 opacity-80">
              <p>This restriction is enforced by our offerwall partners to prevent abuse.</p>
              <p>If you believe this is an error, please contact support with your account details.</p>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isBlocked) {
    const isTor = lastResult?.isTor
    const isProxy = lastResult?.isProxy && !lastResult?.isVPN
    const isHighRiskOnly = !vpnDetected && strictMode && lastResult && lastResult.riskScore >= 65
    
    return (
      <div className="space-y-4 py-8">
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription className="space-y-3">
            <div>
              <p className="font-semibold text-base">
                {isTor ? "Tor Network Detected" : 
                 isProxy ? "Proxy Server Detected" : 
                 isHighRiskOnly ? "Suspicious Connection Detected" :
                 "VPN/Proxy Detected"}
              </p>
              <p className="text-sm mt-1">
                {isTor 
                  ? "Tor connections are not allowed for offerwalls. Please use a direct connection."
                  : isProxy 
                    ? "Proxy servers are not allowed for offerwalls. Please disable your proxy."
                    : isHighRiskOnly
                      ? "Your connection appears suspicious. Please ensure you're not using any VPN, proxy, or anonymization tool."
                      : "Offerwalls require a direct internet connection. Please disable your VPN, proxy, or Tor connection to access offers."}
              </p>
            </div>
            <div className="text-xs space-y-1 opacity-80">
              <p>This restriction is required by our offerwall partners to prevent fraud and ensure fair payouts for all users.</p>
              <p>Your connection is checked every 15 seconds. Once you disable your VPN, access will be restored automatically.</p>
              {lastResult && (
                <div className="mt-2 p-2 bg-background/50 rounded text-[10px] font-mono">
                  <p>Risk Score: {lastResult.riskScore}/100</p>
                  <p>Confidence: {lastResult.confidence}%</p>
                  {lastResult.methods.length > 0 && (
                    <p>Methods: {lastResult.methods.join(", ")}</p>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recheck()}
              disabled={isChecking}
              className="mt-2 gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
              {isChecking ? "Checking..." : "Re-check Connection"}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <>{children}</>
}
