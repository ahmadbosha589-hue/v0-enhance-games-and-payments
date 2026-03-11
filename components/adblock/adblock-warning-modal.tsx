"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Shield,
  ShieldOff,
  RefreshCw,
  Clock,
  Ban,
  Wifi,
  Fingerprint,
  Globe,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAdblockDetection } from "@/lib/hooks/use-adblock-detection"
import type { DetectionSignal } from "@/lib/adblock/detection-engine"

interface AdblockWarningModalProps {
  userId: string
  warningDurationSeconds?: number
  onFraudFlagged?: (
    blockerType: string | null,
    confidence: number,
    methods: string[],
    signals: DetectionSignal[],
    serverVerified: boolean,
  ) => void
}

export function AdblockWarningModal({ userId, warningDurationSeconds = 60, onFraudFlagged }: AdblockWarningModalProps) {
  const { isDetected, isChecking, forceRecheck, confidence, blockerType, consecutiveDetections, detectionResult } =
    useAdblockDetection()

  const signals = detectionResult?.signals || []
  const detectionMethods = detectionResult?.signals?.map((s) => s.method) || []
  const serverVerified = detectionResult?.serverVerified || false

  const [timeRemaining, setTimeRemaining] = useState(warningDurationSeconds)
  const [isFlagged, setIsFlagged] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [isRechecking, setIsRechecking] = useState(false)
  const [appealStatus, setAppealStatus] = useState<"none" | "pending" | "accepted" | "rejected">("none")
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const flaggedRef = useRef(false)

  useEffect(() => {
    if (isDetected && !isChecking && !isFlagged) {
      setShowWarning(true)
    } else if (!isDetected && !isChecking) {
      setShowWarning(false)
      setTimeRemaining(warningDurationSeconds)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isDetected, isChecking, isFlagged, warningDurationSeconds, consecutiveDetections])

  const flagUserAsFraud = useCallback(async () => {
    if (flaggedRef.current || isFlagging) return

    if (!isDetected) {
      return
    }

    flaggedRef.current = true
    setIsFlagging(true)

    try {
      const response = await fetch("/api/fraud/adblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reason: "adblock_persistent_verified",
          warningDuration: warningDurationSeconds,
          detectionMethods,
          confidence,
          blockerType,
          consecutiveDetections,
          serverVerified,
          signals: signals.map((s) => ({
            method: s.method,
            category: s.category,
            weight: s.weight,
            confidence: s.confidence,
          })),
        }),
      })

      if (response.ok) {
        setIsFlagged(true)
        onFraudFlagged?.(blockerType, confidence, detectionMethods, signals, serverVerified)
      }
    } catch (error) {
      console.error("Failed to flag user:", error)
      flaggedRef.current = false
    } finally {
      setIsFlagging(false)
    }
  }, [
    userId,
    warningDurationSeconds,
    onFraudFlagged,
    isFlagging,
    detectionMethods,
    confidence,
    blockerType,
    consecutiveDetections,
    serverVerified,
    signals,
    isDetected,
  ])

  // Timer countdown
  useEffect(() => {
    if (showWarning && !isFlagged && !flaggedRef.current && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
            flagUserAsFraud()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current && !showWarning) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [showWarning, isFlagged, flagUserAsFraud])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const handleRecheckClick = async () => {
    setIsRechecking(true)

    // Stop the timer during recheck
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    try {
      await forceRecheck()
      // After recheck, the hook's isDetected state will update via useEffect
      // Reset timer regardless - the useEffect watching isDetected handles show/hide
      setTimeRemaining(warningDurationSeconds)
    } catch {
      // Silently handle error
    } finally {
      setIsRechecking(false)
    }
  }

  const handleAppeal = async () => {
    setAppealStatus("pending")
    try {
      const res = await fetch("/api/fraud/adblock/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          signals,
          confidence,
          detectionMethods,
          consecutiveDetections,
          serverVerified,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.appealAccepted) {
          setAppealStatus("accepted")
          setIsFlagged(false)
          flaggedRef.current = false
          setShowWarning(false)
        } else {
          setAppealStatus("rejected")
        }
      } else {
        setAppealStatus("rejected")
      }
    } catch {
      setAppealStatus("rejected")
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progressPercent = (timeRemaining / warningDurationSeconds) * 100

  const getBlockerInfo = () => {
    const blockerName = blockerType || "Ad Blocker"

    switch (blockerType) {
      case "Brave Shields":
        return {
          title: "Brave Shields Detected",
          icon: <Fingerprint className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the Brave Shields icon (lion) in the address bar",
            "Toggle OFF 'Shields are UP' to disable shields completely",
            "Or click 'Advanced View' and set 'Trackers & ads blocking' to 'Disabled'",
            "Refresh the page after making changes",
          ],
        }

      case "uBlock Origin":
        return {
          title: "uBlock Origin Detected",
          icon: <ShieldOff className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the uBlock Origin icon (red shield) in your browser toolbar",
            "Click the large blue power button to disable for this site",
            "The icon should turn gray when disabled",
            "Refresh the page after disabling",
          ],
        }

      case "AdBlock Plus":
        return {
          title: "AdBlock Plus Detected",
          icon: <ShieldOff className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the AdBlock Plus icon (ABP) in your browser toolbar",
            "Click 'Enabled on this site' to toggle it off",
            "Or click the gear icon and add this site to the whitelist",
            "Refresh the page after disabling",
          ],
        }

      case "AdGuard":
        return {
          title: "AdGuard Detected",
          icon: <Shield className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the AdGuard icon in your browser toolbar",
            "Toggle the switch to disable protection for this site",
            "Or right-click and select 'Don't filter on this website'",
            "Refresh the page after disabling",
          ],
        }

      case "Ghostery":
        return {
          title: "Ghostery Detected",
          icon: <Globe className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the Ghostery icon (ghost) in your browser toolbar",
            "Click 'Trust Site' to whitelist this domain",
            "Or toggle off all tracker categories for this site",
            "Refresh the page after making changes",
          ],
        }

      case "Firefox Tracking Protection":
        return {
          title: "Firefox Tracking Protection Detected",
          icon: <Shield className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the shield icon in the address bar",
            "Toggle OFF 'Enhanced Tracking Protection is ON for this site'",
            "Or go to Settings > Privacy & Security and add this site to exceptions",
            "Refresh the page after making changes",
          ],
        }

      case "Opera Ad Blocker":
        return {
          title: "Opera Ad Blocker Detected",
          icon: <Shield className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click the shield icon in the address bar",
            "Toggle OFF the ad blocker for this site",
            "Or go to Settings > Privacy & Security and disable the built-in ad blocker",
            "Refresh the page after making changes",
          ],
        }

      case "DNS/Network Level Blocker":
        return {
          title: "Network-Level Ad Blocker Detected",
          icon: <Wifi className="h-8 w-8 text-amber-500" />,
          instructions: [
            "You appear to be using a DNS or network-level ad blocker",
            "Check your router settings for ad-blocking features",
            "If using Pi-hole, AdGuard Home, or NextDNS, whitelist this domain",
            "VPN ad-blocking features may also cause this detection",
            "Whitelist this site in your network/DNS blocker settings",
          ],
        }

      default:
        return {
          title: `${blockerName} Detected`,
          icon: <ShieldOff className="h-8 w-8 text-amber-500" />,
          instructions: [
            "Click on your adblocker extension icon in the browser toolbar",
            "Select 'Don't run on this site', 'Pause', or 'Disable'",
            "Some adblockers have a power button to toggle off",
            "Check for multiple ad blockers - disable all of them",
            "Refresh the page after disabling",
          ],
        }
    }
  }

  if (isChecking && !showWarning) return null
  if (!showWarning && !isFlagged) return null

  if (isFlagged) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
        <Card className="mx-4 max-w-lg border-red-500/50 bg-gradient-to-br from-red-950/90 to-black shadow-2xl shadow-red-500/20">
          <CardContent className="p-6 sm:p-8 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 ring-4 ring-red-500/30">
              <Ban className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-red-500">Account Flagged</h2>
            <p className="mb-6 text-muted-foreground">
              Your account has been flagged for persistent adblock usage. This action has been reported to our fraud
              prevention team for review.
            </p>

            {blockerType && <p className="mb-4 text-sm text-red-400">Detected: {blockerType}</p>}

            <div className="mb-4 flex items-center justify-center gap-2">
              {serverVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Server Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
                  <XCircle className="h-3 w-3" />
                  Client Detection
                </span>
              )}
            </div>

            {appealStatus === "none" && (
              <Button variant="outline" onClick={handleAppeal} className="mt-4 bg-transparent">
                Appeal This Decision
              </Button>
            )}
            {appealStatus === "pending" && <p className="mt-4 text-sm text-muted-foreground">Processing appeal...</p>}
            {appealStatus === "accepted" && (
              <p className="mt-4 text-sm text-green-500">Appeal accepted! Refreshing...</p>
            )}
            {appealStatus === "rejected" && (
              <p className="mt-4 text-sm text-red-400">Appeal rejected. Please contact support.</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const blockerInfo = getBlockerInfo()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <Card className="mx-4 max-w-lg border-amber-500/50 bg-gradient-to-br from-amber-950/90 to-black shadow-2xl shadow-amber-500/20">
        <CardContent className="p-6 sm:p-8">
          {/* Progress bar */}
          <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-amber-950">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 ring-4 ring-amber-500/30">
              {blockerInfo.icon}
            </div>

            <h2 className="mb-2 text-xl font-bold text-amber-500">{blockerInfo.title}</h2>

            <div className="mb-4 flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Time remaining: {formatTime(timeRemaining)}</span>
            </div>

            <p className="mb-6 text-sm text-muted-foreground">
              Please disable your ad blocker to continue using this platform. We rely on ads to keep our service free.
            </p>

            <div className="mb-6 rounded-lg bg-amber-500/10 p-4 text-left">
              <h3 className="mb-2 font-semibold text-amber-400">How to disable:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {blockerInfo.instructions.map((instruction, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500">{i + 1}.</span>
                    {instruction}
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleRecheckClick}
                disabled={isRechecking}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {isRechecking ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    I've Disabled It - Check Again
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="text-muted-foreground"
              >
                <Info className="mr-2 h-4 w-4" />
                {showDiagnostics ? "Hide" : "Show"} Detection Details
              </Button>
            </div>

            {showDiagnostics && (
              <div className="mt-4 rounded-lg bg-black/50 p-4 text-left text-xs">
                <p className="text-muted-foreground">
                  <strong>Blocker:</strong> {blockerType || "Unknown"}
                </p>
                <p className="text-muted-foreground">
                  <strong>Confidence:</strong> {confidence.toFixed(1)}%
                </p>
                <p className="text-muted-foreground">
                  <strong>Methods:</strong> {detectionMethods.join(", ") || "None"}
                </p>
                <p className="text-muted-foreground">
                  <strong>Consecutive:</strong> {consecutiveDetections}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
