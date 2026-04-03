"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import type { Profile } from "@/lib/types/database"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Coins, Loader2, CheckCircle, AlertTriangle, Flame, Gift, Shield, RefreshCw, Play, Clock } from "lucide-react"
import { toast } from "sonner"
import { formatCountdown, formatSatoshisDisplay } from "@/lib/utils/format"
import { CLAIM_CONFIG } from "@/lib/constants/config"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { AntiBotVerification, type VerificationMetadata } from "@/components/captcha/anti-bot-verification"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { useDeviceFingerprintContext } from "@/components/security/device-fingerprint-provider"
import { usePersistentVPNCheck } from "@/hooks/use-persistent-vpn-check"

interface ClaimInterfaceProps {
  profile: Profile
  turnstileSiteKey?: string
}

type ClaimState = "ready" | "cooldown" | "claiming" | "success" | "error" | "verification"

export function ClaimInterface({ profile, turnstileSiteKey = "" }: ClaimInterfaceProps) {
  const { fingerprint: deviceFingerprint, deviceStatus } = useDeviceFingerprintContext()
  const { vpnDetected: vpnBlocked, isChecking: vpnChecking, lastResult: vpnResult, recheck: recheckVPN } = usePersistentVPNCheck({
    intervalMs: 30000, // Re-check every 30 seconds
    checkOnVisibilityChange: true,
    checkOnNetworkChange: true,
  })
  const [state, setState] = useState<ClaimState>("cooldown")
  const [secondsUntilClaim, setSecondsUntilClaim] = useState(0)
  const [lastClaimAmount, setLastClaimAmount] = useState(0)
  const [newStreak, setNewStreak] = useState(profile.claim_streak)
  const [newBalance, setNewBalance] = useState(Number(profile.balance_satoshis))
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [showDoubleRewardModal, setShowDoubleRewardModal] = useState(false)
  const [adProgress, setAdProgress] = useState<number[]>([0, 0, 0])
  const [adStatus, setAdStatus] = useState<("pending" | "playing" | "completed")[]>(["pending", "pending", "pending"])
  const [adTimeRemaining, setAdTimeRemaining] = useState([60, 60, 60])
  const [allAdsCompleted, setAllAdsCompleted] = useState(false)
  const [isClaimingDouble, setIsClaimingDouble] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isClaimInFlight = useRef(false)
  const router = useRouter()

  // Show toast when VPN is newly detected during persistent checks
  const prevVpnBlocked = useRef(false)
  useEffect(() => {
    if (vpnBlocked && !prevVpnBlocked.current) {
      toast.error("VPN/Proxy detected", {
        description: "Please disable your VPN or proxy to claim rewards. Your connection is checked continuously.",
        duration: 10000,
      })
    }
    prevVpnBlocked.current = vpnBlocked
  }, [vpnBlocked])

  const calculateTimeUntilClaim = useCallback(() => {
    if (!profile.last_claim_at) return 0

    const lastClaim = new Date(profile.last_claim_at).getTime()
    const now = Date.now()
    const cooldownMs = CLAIM_CONFIG.cooldownSeconds * 1000
    const timeLeft = Math.max(0, cooldownMs - (now - lastClaim))

    return Math.ceil(timeLeft / 1000)
  }, [profile.last_claim_at])

  useEffect(() => {
    const seconds = calculateTimeUntilClaim()
    setSecondsUntilClaim(seconds)
    if (seconds === 0) {
      setState(isVerified ? "ready" : "verification")
    } else {
      setState("cooldown")
    }

    const interval = setInterval(() => {
      const newSeconds = calculateTimeUntilClaim()
      setSecondsUntilClaim(newSeconds)
      if (newSeconds === 0 && state === "cooldown") {
        setState(isVerified ? "ready" : "verification")
        if (typeof window !== "undefined" && "Notification" in window) {
          new Audio("/sounds/claim-ready.mp3").play().catch(() => { })
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [calculateTimeUntilClaim, state, isVerified])

  const handleVerificationComplete = (token: string, metadata?: VerificationMetadata) => {
    setCaptchaToken(token)
    setIsVerified(true)
    setState("ready")

    toast.success("Verification complete!", { description: "You can now claim your reward" })
  }

  const handleVerificationFail = (reason: string) => {
    setIsVerified(false)
    setCaptchaToken(null)
    toast.error("Verification failed", {
      description: reason || "Please try again",
      duration: 8000,
    })

    // If bot detected, redirect to login
    if (reason.toLowerCase().includes("bot") || reason.toLowerCase().includes("automation")) {
      setTimeout(() => {
        router.push("/auth/login?error=bot_detected")
      }, 3000)
      return
    }

    // Reset verification after a short delay
    setTimeout(() => {
      if (secondsUntilClaim === 0) {
        setState("verification")
      }
    }, 2000)
  }

  // Watch Ad Double Reward - 3 simultaneous 60-second ads
  useEffect(() => {
    if (!showDoubleRewardModal || allAdsCompleted) return

    const interval = setInterval(() => {
      setAdTimeRemaining(prev => {
        const newTimes = prev.map(t => Math.max(0, t - 1))
        setAdProgress(newTimes.map(t => ((60 - t) / 60) * 100))
        setAdStatus(newTimes.map(t => t === 0 ? "completed" : "playing"))
        if (newTimes.every(t => t === 0)) {
          setAllAdsCompleted(true)
        }
        return newTimes
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [showDoubleRewardModal, allAdsCompleted])

  const startDoubleRewardAds = useCallback(() => {
    setShowDoubleRewardModal(true)
    setAdStatus(["playing", "playing", "playing"])
    setAdProgress([0, 0, 0])
    setAdTimeRemaining([60, 60, 60])
    setAllAdsCompleted(false)
  }, [])

  const handleClaimDoubleReward = async () => {
    if (!allAdsCompleted || isClaimingDouble) return
    setIsClaimingDouble(true)

    try {
      const response = await fetch("/api/claim/double-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseAmount: lastClaimAmount })
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Double reward claimed! +${formatSatoshisDisplay(data.amount)} satoshis`, {
          description: "Added to your balance"
        })
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        setNewBalance(prev => prev + data.amount)
        setShowDoubleRewardModal(false)
        router.refresh()
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to claim double reward")
      }
    } catch {
      toast.error("Failed to claim double reward")
    } finally {
      setIsClaimingDouble(false)
    }
  }

  const triggerConfetti = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const x = (rect.left + rect.width / 2) / window.innerWidth
      const y = (rect.top + rect.height / 2) / window.innerHeight

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x, y },
        colors: ["#00D4FF", "#10B981", "#F59E0B"],
      })
    }
  }

  const handleClaim = async () => {
    if (state !== "ready") return

    // Hard lock: prevent concurrent requests regardless of React state timing
    if (isClaimInFlight.current) return
    isClaimInFlight.current = true

    if (profile.status !== "active") {
      isClaimInFlight.current = false
      toast.error("Your account is not active")
      return
    }

    if (profile.is_flagged && profile.fraud_score >= 70) {
      toast.error("Your account is under review. Please contact support.")
      return
    }

    if (deviceStatus === "blocked") {
      isClaimInFlight.current = false
      toast.error("This device has been blocked. Please contact support.")
      return
    }

    if (vpnBlocked) {
      isClaimInFlight.current = false
      toast.error("VPN/Proxy detected", {
        description: "Please disable your VPN or proxy to claim rewards.",
      })
      return
    }

    setState("claiming")

    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captchaToken,
          fingerprint: deviceFingerprint
            ? { visitorId: deviceFingerprint }
            : undefined,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientLanguage: navigator.language,
          screenResolution: `${screen.width}x${screen.height}`,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.cooldownRemaining) {
          isClaimInFlight.current = false
          setSecondsUntilClaim(data.cooldownRemaining)
          setState("cooldown")
          toast.error("Cooldown still active")
          return
        }
        throw new Error(data.error || "Failed to claim")
      }

      setLastClaimAmount(data.amount)
      setNewStreak(data.streak)
      setNewBalance(data.balance)
      setState("success")

      triggerConfetti()
      new Audio("/sounds/claim-success.mp3").play().catch(() => { })

      toast.success(`Claimed ${formatSatoshisDisplay(data.amount)}!`, {
        description: `Day ${data.streak} streak bonus applied`,
      })

      setIsVerified(false)
      setCaptchaToken(null)
      isClaimInFlight.current = false

      setTimeout(() => {
        router.refresh()
        setState("cooldown")
        setSecondsUntilClaim(CLAIM_CONFIG.cooldownSeconds)
      }, 3000)
    } catch (error) {
      isClaimInFlight.current = false
      setState("error")
      toast.error(error instanceof Error ? error.message : "Failed to claim")
      setTimeout(() => {
        const seconds = calculateTimeUntilClaim()
        if (seconds === 0) {
          setState(isVerified ? "ready" : "verification")
        } else {
          setState("cooldown")
        }
      }, 2000)
    }
  }

  const progressValue = ((CLAIM_CONFIG.cooldownSeconds - secondsUntilClaim) / CLAIM_CONFIG.cooldownSeconds) * 100

  const estimatedMin = CLAIM_CONFIG.baseAmountSatoshis
  const estimatedMax = CLAIM_CONFIG.maxAmountSatoshis

  return (
    <Card className="overflow-hidden border-2 border-primary/20">
      <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-transparent to-accent/10 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Coins className="h-5 w-5 text-primary" />
              Faucet Claim
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Claim free satoshis every {CLAIM_CONFIG.cooldownSeconds / 60} minutes
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isVerified && (
              <Badge variant="outline" className="gap-1 text-xs border-green-500/50 text-green-600">
                <CheckCircle className="h-3 w-3" />
                Verified
              </Badge>
            )}
            {profile.claim_streak > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Flame className="h-3 w-3 text-orange-500" />
                {profile.claim_streak} day streak
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* VPN/Proxy Warning Banner */}
        {vpnBlocked && (
          <div className="bg-destructive/10 border-b border-destructive/20 p-3 sm:p-4 flex items-start gap-3">
            <Shield className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">VPN/Proxy Detected</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                Please disable your VPN, proxy, or Tor connection to claim rewards. Your connection is monitored continuously.
              </p>
              {vpnResult && vpnResult.methods.length > 0 && (
                <p className="text-[10px] text-destructive/60 mt-1">
                  Detection: {vpnResult.methods.join(", ")}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => recheckVPN()}
                disabled={vpnChecking}
                className="mt-2 gap-2 h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 ${vpnChecking ? "animate-spin" : ""}`} />
                {vpnChecking ? "Checking..." : "Re-check Now"}
              </Button>
            </div>
          </div>
        )}

        <div className="relative flex min-h-[320px] sm:min-h-[400px] flex-col items-center justify-center p-4 sm:p-8">
          {/* Animated background */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {state === "ready" && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              />
            )}
            {state === "success" && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-transparent to-emerald-500/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            )}
          </div>

          <AnimatePresence mode="wait">
            {state === "cooldown" && (
              <motion.div
                key="cooldown"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative flex flex-col items-center gap-4 sm:gap-6"
              >
                {/* Circular progress */}
                <div className="relative">
                  <svg className="h-32 w-32 sm:h-40 sm:w-40 -rotate-90 transform">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-muted/20"
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      className="text-primary transition-all duration-1000"
                      strokeDasharray={283}
                      strokeDashoffset={283 - (283 * progressValue) / 100}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl sm:text-4xl font-bold tabular-nums">
                      {formatCountdown(secondsUntilClaim)}
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">until next claim</span>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Estimated reward:{" "}
                    <span className="font-semibold text-foreground">
                      {estimatedMin} - {estimatedMax} satoshis
                    </span>
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Shield className="h-3 w-3" />
                    Keep this page open or come back later
                  </p>
                  <p className="text-[10px] text-amber-500/80 mt-2">
                    Want more? Try Offerwalls & Shortlinks for bigger rewards!
                  </p>
                </div>
              </motion.div>
            )}

            {state === "verification" && (
              <motion.div
                key="verification"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full"
              >
                <AntiBotVerification
                  turnstileSiteKey={turnstileSiteKey}
                  onComplete={handleVerificationComplete}
                  onFail={handleVerificationFail}
                  difficulty={profile.fraud_score > 50 ? "hard" : profile.fraud_score > 30 ? "hard" : "normal"}
                  requireProofOfWork={profile.fraud_score > 40}
                />
              </motion.div>
            )}

            {state === "ready" && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4 sm:gap-6"
              >
                <motion.div
                  className="relative"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                >
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
                  <div className="relative flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80">
                    <Gift className="h-12 w-12 sm:h-16 sm:w-16 text-primary-foreground" />
                  </div>
                </motion.div>

                <div className="text-center space-y-2">
                  <h3 className="text-xl sm:text-2xl font-bold">Your reward is ready!</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Claim{" "}
                    <span className="font-semibold text-primary">
                      {estimatedMin} - {estimatedMax}
                    </span>{" "}
                    satoshis
                  </p>
                </div>

                <Button
                  ref={buttonRef}
                  size="lg"
                  disabled={state === "claiming" || isClaimInFlight.current}
                  className="gap-2 px-8 sm:px-12 py-5 sm:py-6 text-base sm:text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  onClick={handleClaim}
                >
                  <Coins className="h-5 w-5 sm:h-6 sm:w-6" />
                  Claim Now
                </Button>
              </motion.div>
            )}

            {state === "claiming" && (
              <motion.div
                key="claiming"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4 sm:gap-6"
              >
                <div className="relative">
                  <Loader2 className="h-20 w-20 sm:h-24 sm:w-24 animate-spin text-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Coins className="h-8 w-8 sm:h-10 sm:w-10 text-primary/50" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-medium">Processing your claim...</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Verifying and calculating rewards</p>
                </div>
              </motion.div>
            )}

            {state === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4 sm:gap-6"
              >
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10 }}>
                  <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-green-500/20">
                    <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-500" />
                  </div>
                </motion.div>

                <div className="text-center space-y-2">
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl sm:text-5xl font-bold text-green-500"
                  >
                    +{formatSatoshisDisplay(lastClaimAmount)}
                  </motion.p>
                  <p className="text-base sm:text-lg text-muted-foreground">Claimed successfully!</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-2">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Flame className="h-3 w-3 text-orange-500" />
                      Day {newStreak} Streak
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-xs">
                      Balance: {formatSatoshisDisplay(newBalance)}
                    </Badge>
                  </div>

                  {/* Watch Ad to Double Reward Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="pt-4"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:border-amber-500/50"
                      onClick={startDoubleRewardAds}
                    >
                      <Play className="h-3 w-3" />
                      Watch Ads to Double Your Reward
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Watch 3 ads (60s each) to earn +{formatSatoshisDisplay(lastClaimAmount)} bonus
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4 sm:gap-6"
              >
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-destructive/20">
                  <AlertTriangle className="h-12 w-12 sm:h-16 sm:w-16 text-destructive" />
                </div>
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-medium text-destructive">Claim failed</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Please try again in a moment</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-px border-t bg-muted/50">
          <div className="bg-background p-3 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold">{profile.total_claims}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Claims</p>
          </div>
          <div className="bg-background p-3 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold">{profile.max_claim_streak || 0}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Best Streak</p>
          </div>
          <div className="bg-background p-3 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold">
              {formatSatoshisDisplay(Number(profile.total_earned_satoshis))}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Earned</p>
          </div>
        </div>
      </CardContent>

      {/* Watch Ad Double Reward Modal */}
      {showDoubleRewardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl border-amber-500/30 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 text-amber-500" />
                Watch Ads to Double Your Reward
              </CardTitle>
              <CardDescription>
                Watch all 3 ads (60 seconds each) to receive +{formatSatoshisDisplay(lastClaimAmount)} bonus
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 3 Ad Slots Running Simultaneously */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "relative rounded-lg border p-3 transition-all",
                      adStatus[i] === "completed" && "bg-green-500/10 border-green-500/30",
                      adStatus[i] === "playing" && "bg-red-500/5 border-red-500/30",
                      adStatus[i] === "pending" && "bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Ad #{i + 1}</span>
                      {adStatus[i] === "completed" ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <div className="flex items-center gap-1 text-red-500">
                          <Clock className="h-3 w-3 animate-pulse" />
                          <span className="text-xs font-mono">{adTimeRemaining[i]}s</span>
                        </div>
                      )}
                    </div>
                    <Progress value={adProgress[i]} className="h-1.5" />

                    {/* Ad Content Placeholder */}
                    <div
                      className="mt-2 aspect-video bg-muted/50 rounded flex items-center justify-center border border-dashed"
                      data-ad-slot={`double-reward-faucet-${i}`}
                    >
                      {adStatus[i] === "playing" ? (
                        <div className="text-center">
                          <Play className="h-6 w-6 mx-auto text-muted-foreground/50 animate-pulse" />
                          <span className="text-[10px] text-muted-foreground">Ad playing...</span>
                        </div>
                      ) : adStatus[i] === "completed" ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 11 Other Ad Networks Running */}
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-2">Partner Ads</p>
                <MultiNetworkAds position="content" layout="inline" showLabels={false} priority="high" />
              </div>

              {/* Claim Button */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDoubleRewardModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={cn(
                    "flex-1 gap-2",
                    allAdsCompleted ? "bg-gradient-to-r from-amber-500 to-orange-500" : ""
                  )}
                  disabled={!allAdsCompleted || isClaimingDouble}
                  onClick={handleClaimDoubleReward}
                >
                  {isClaimingDouble ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Claiming...
                    </>
                  ) : allAdsCompleted ? (
                    <>
                      <Coins className="h-4 w-4" />
                      Claim +{formatSatoshisDisplay(lastClaimAmount)}
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4" />
                      Complete All Ads
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  )
}
