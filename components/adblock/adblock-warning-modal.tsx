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
  // v13.0: integrity key forces a remount of the modal DOM if tampered with.
  // Each time the watchdog detects hiding/removal it bumps this key and React
  // re-mounts the entire modal tree with a fresh random container id.
  const [integrityKey, setIntegrityKey] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const flaggedRef = useRef(false)
  const modalRef = useRef<HTMLDivElement | null>(null)
  // v13.0: generate randomized container ID that's resistant to cosmetic filter targeting
  const containerIdRef = useRef<string>("")
  if (!containerIdRef.current) {
    containerIdRef.current = `s-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
  }

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

  // v14.0: BODY SCROLL LOCK — when the warning/flagged modal is showing we
  // freeze the page beneath so the user can't scroll past it, dismiss it
  // accidentally on iOS rubber-banding, or pinch-zoom out of it. Restores
  // the previous styles on unmount.
  useEffect(() => {
    if (!showWarning && !isFlagged) return
    if (typeof window === "undefined") return

    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyTouch: body.style.touchAction,
      bodyOverscroll: body.style.overscrollBehavior,
    }
    const scrollY = window.scrollY

    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    body.style.touchAction = "none"
    body.style.overscrollBehavior = "none"
    // On iOS, position:fixed on body is the only way to truly lock scroll.
    body.style.position = "fixed"
    body.style.top = `-${scrollY}px`
    body.style.width = "100%"

    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.width = prev.bodyWidth
      body.style.touchAction = prev.bodyTouch
      body.style.overscrollBehavior = prev.bodyOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [showWarning, isFlagged])

  // v13.0: TAMPER-RESISTANCE WATCHDOG
  // Defeats users / extensions who try to hide our modal via cosmetic filters,
  // CSS injection, DevTools, or manual DOM removal. Every 1500ms we:
  //   1. Verify the modal element still exists in the DOM
  //   2. Verify the computed style is visible (display, visibility, opacity)
  //   3. Verify it has reasonable on-screen size (not collapsed)
  // If any check fails while we should be showing the modal, we bump the
  // integrity key to force a fresh remount with a new random container id —
  // this defeats targeted cosmetic filters and CSS overrides.
  useEffect(() => {
    if (!showWarning && !isFlagged) return

    const watchdog = setInterval(() => {
      const el = modalRef.current
      if (!el) {
        setIntegrityKey((k) => k + 1)
        return
      }
      try {
        // Check element is still attached to the document
        if (!document.body.contains(el)) {
          setIntegrityKey((k) => k + 1)
          return
        }
        const cs = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        const isHidden =
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          Number.parseFloat(cs.opacity || "1") < 0.5 ||
          rect.width < 100 ||
          rect.height < 100 ||
          cs.pointerEvents === "none"
        if (isHidden) {
          // Regenerate container id and remount — cosmetic filters can't keep up.
          containerIdRef.current = `s-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
          setIntegrityKey((k) => k + 1)
        }
      } catch {
        // ignore — next tick will retry
      }
    }, 1500)

    return () => clearInterval(watchdog)
  }, [showWarning, isFlagged])

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

  // v14.0: inline-style fortress — uses !important-equivalent inline styles so
  // injected stylesheets cannot override them. Combined with the randomized
  // container id this defeats virtually all cosmetic filtering attempts.
  //
  // Mobile-specific fixes (v14.0):
  //   • Uses `100dvh`/`100svh` (dynamic viewport) so the modal always covers
  //     the visible area even as mobile browser toolbars expand/collapse.
  //     Falls back to `100vh` for browsers without dvh support.
  //   • `100vw` width to bypass any ancestor `transform`/`will-change` that
  //     would otherwise make `position:fixed` containing-block-relative.
  //   • `top:0;left:0` instead of `inset:0` for broader mobile support.
  //   • `touch-action: none` and `overscroll-behavior: contain` to block
  //     page scrolling beneath the modal on touch devices.
  //   • `userSelect: none` and `WebkitTapHighlightColor: transparent` for a
  //     native overlay feel on iOS/Android.
  const fortressStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100vw",
    // Dynamic viewport units are the only reliable way to get full-screen on
    // mobile Safari, Chrome iOS, Firefox Android, Brave mobile, etc. without
    // gaps. The browser will pick the first supported unit.
    height: "100dvh",
    minHeight: "100svh",
    zIndex: 2147483647, // max 32-bit signed int — sits above everything
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    padding: "1rem",
    opacity: 1,
    visibility: "visible",
    pointerEvents: "auto",
    transform: "none",
    clip: "auto",
    clipPath: "none",
    overflow: "auto",
    overscrollBehavior: "contain",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    WebkitOverflowScrolling: "touch",
  }

  if (isFlagged) {
    return (
      <div
        key={`flagged-${integrityKey}`}
        ref={modalRef}
        id={containerIdRef.current}
        data-integrity={integrityKey}
        style={fortressStyle}
      >
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
    <div
      key={`warning-${integrityKey}`}
      ref={modalRef}
      id={containerIdRef.current}
      data-integrity={integrityKey}
      style={fortressStyle}
    >
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
