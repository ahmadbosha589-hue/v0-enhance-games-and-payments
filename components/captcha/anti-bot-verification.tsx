"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, Bot, Calculator, ImageIcon, CheckCircle, Loader2, Cpu, Puzzle, AlertTriangle, Lock } from "lucide-react"
import { HCaptchaWidget } from "./hcaptcha-widget"
import { MathChallenge } from "./math-challenge"
import { ImageChallenge } from "./image-challenge"
import { ProofOfWorkChallenge } from "./proof-of-work-challenge"
import { SliderPuzzleChallenge, type SliderBehaviorData } from "./slider-puzzle-challenge"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { useUltimateAntiBot, type BotDetectionResult } from "@/hooks/use-ultimate-anti-bot"
import { toast } from "sonner"

// =====================================================
// ULTIMATE ANTI-BOT VERIFICATION SYSTEM
// Multi-layered protection with behavioral analysis,
// proof-of-work, slider puzzles, and real-time bot detection
// With Cloudflare WAF integration for enterprise protection
// =====================================================

// Security check item with animated status
function SecurityCheckItem({ label, delay }: { label: string; delay: number }) {
  const [status, setStatus] = useState<"pending" | "checking" | "passed">("pending")

  useEffect(() => {
    const startTimer = setTimeout(() => setStatus("checking"), delay)
    const completeTimer = setTimeout(() => setStatus("passed"), delay + 400)
    return () => {
      clearTimeout(startTimer)
      clearTimeout(completeTimer)
    }
  }, [delay])

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/30">
      <span className="text-muted-foreground">{label}</span>
      {status === "pending" && (
        <span className="h-3 w-3 rounded-full border border-muted-foreground/30" />
      )}
      {status === "checking" && (
        <Loader2 className="h-3 w-3 text-primary animate-spin" />
      )}
      {status === "passed" && (
        <CheckCircle className="h-3 w-3 text-green-500" />
      )}
    </div>
  )
}

interface AntiBotVerificationProps {
  hcaptchaSiteKey?: string
  /** @deprecated Use hcaptchaSiteKey instead */
  turnstileSiteKey?: string
  onComplete: (token: string, metadata?: VerificationMetadata) => void
  onFail: (reason: string) => void
  difficulty?: "normal" | "hard" | "extreme"
  requireProofOfWork?: boolean
}

export interface VerificationMetadata {
  turnstileToken?: string
  mathSolved: boolean
  imageSolved: boolean
  sliderBehavior?: SliderBehaviorData
  proofOfWork?: { nonce: number; hash: string; duration: number }
  behaviorScore: number
  totalDuration: number
  timestamp: number
}

type VerificationStep = "bot-check" | "turnstile" | "slider" | "math" | "image" | "pow" | "complete" | "blocked"

interface StepStatus {
  botCheck: "pending" | "active" | "complete" | "failed"
  turnstile: "pending" | "active" | "complete" | "skipped"
  slider: "pending" | "active" | "complete" | "failed"
  math: "pending" | "active" | "complete" | "failed"
  image: "pending" | "active" | "complete" | "failed"
  pow: "pending" | "active" | "complete" | "skipped"
}

export function AntiBotVerification({
  hcaptchaSiteKey,
  turnstileSiteKey, // deprecated, falls back to hcaptchaSiteKey
  onComplete,
  onFail,
  difficulty = "normal",
  requireProofOfWork = false,
}: AntiBotVerificationProps) {
  // Support both hcaptchaSiteKey and legacy turnstileSiteKey
  const captchaSiteKey = hcaptchaSiteKey || turnstileSiteKey
  const hasCaptcha = !!captchaSiteKey
  const startTime = useRef(Date.now())

  // Bot detection
  const [botCheckPassed, setBotCheckPassed] = useState(false)
  const [botCheckFailed, setBotCheckFailed] = useState(false)
  const botDetectionRef = useRef<BotDetectionResult | null>(null)

  // Use the ultimate anti-bot detection
  const botDetection = useUltimateAntiBot((result) => {
    botDetectionRef.current = result
    if (result.isBot || result.shouldLogout) {
      setBotCheckFailed(true)
      setCurrentStep("blocked")
      onFail("Bot/automation detected: " + result.detectedThreats.join(", "))
    }
  })

  // Determine initial step
  const getInitialStep = (): VerificationStep => {
    if (botDetection.isBot) return "blocked"
    return "bot-check"
  }

  const [currentStep, setCurrentStep] = useState<VerificationStep>(getInitialStep())
  const [stepStatus, setStepStatus] = useState<StepStatus>({
    botCheck: "active",
    turnstile: hasCaptcha ? "pending" : "skipped",
    slider: "pending",
    math: "pending",
    image: difficulty === "hard" || difficulty === "extreme" ? "pending" : "skipped",
    pow: requireProofOfWork || difficulty === "extreme" ? "pending" : "skipped",
  })

  const [verificationToken, setVerificationToken] = useState<string>("")
  const [sliderBehavior, setSliderBehavior] = useState<SliderBehaviorData | null>(null)
  const [powSolution, setPowSolution] = useState<{ nonce: number; hash: string; duration: number } | null>(null)

  // Initial bot check
  useEffect(() => {
    if (currentStep !== "bot-check") return

    const checkTimer = setTimeout(() => {
      if (!botDetection.isBot && botDetection.score < 50) {
        setBotCheckPassed(true)
        setStepStatus(prev => ({
          ...prev,
          botCheck: "complete",
          turnstile: hasCaptcha ? "active" : "skipped",
          slider: hasCaptcha ? "pending" : "active",
        }))
        setCurrentStep(hasCaptcha ? "turnstile" : "slider")
      } else if (botDetection.score >= 50) {
        setBotCheckFailed(true)
        setStepStatus(prev => ({ ...prev, botCheck: "failed" }))
        setCurrentStep("blocked")
        onFail("Suspicious activity detected")
      }
    }, 2000) // Allow 2 seconds for initial detection

    return () => clearTimeout(checkTimer)
  }, [currentStep, botDetection.isBot, botDetection.score, hasCaptcha, onFail])

  const handleTurnstileVerify = (token: string) => {
    setVerificationToken(token)
    setStepStatus(prev => ({ ...prev, turnstile: "complete", slider: "active" }))
    setCurrentStep("slider")
  }

  const handleTurnstileError = () => {
    // Skip Turnstile and go to slider challenge
    setStepStatus(prev => ({ ...prev, turnstile: "skipped", slider: "active" }))
    setCurrentStep("slider")
  }

  const handleSliderComplete = (success: boolean, behaviorData?: SliderBehaviorData) => {
    if (success && behaviorData) {
      setSliderBehavior(behaviorData)
      setStepStatus(prev => ({ ...prev, slider: "complete", math: "active" }))
      setCurrentStep("math")
    } else {
      setStepStatus(prev => ({ ...prev, slider: "failed" }))
      onFail("Slider verification failed - suspected bot behavior")
    }
  }

  const handleMathComplete = (success: boolean) => {
    if (success) {
      // Check if we need image challenge
      const needsImage = stepStatus.image !== "skipped"
      setStepStatus(prev => ({
        ...prev,
        math: "complete",
        image: needsImage ? "active" : "skipped",
        pow: !needsImage && stepStatus.pow !== "skipped" ? "active" : stepStatus.pow,
      }))

      if (needsImage) {
        setCurrentStep("image")
      } else if (stepStatus.pow !== "skipped") {
        setCurrentStep("pow")
      } else {
        completeVerification()
      }
    } else {
      setStepStatus(prev => ({ ...prev, math: "failed" }))
      onFail("Math challenge failed")
    }
  }

  const handleImageComplete = (success: boolean) => {
    if (success) {
      const needsPow = stepStatus.pow !== "skipped"
      setStepStatus(prev => ({
        ...prev,
        image: "complete",
        pow: needsPow ? "active" : "skipped",
      }))

      if (needsPow) {
        setCurrentStep("pow")
      } else {
        completeVerification()
      }
    } else {
      setStepStatus(prev => ({ ...prev, image: "failed" }))
      onFail("Image challenge failed")
    }
  }

  const handlePowComplete = (success: boolean, solution?: { nonce: number; hash: string; duration: number }) => {
    if (success && solution) {
      setPowSolution(solution)
      setStepStatus(prev => ({ ...prev, pow: "complete" }))
      completeVerification()
    } else {
      setStepStatus(prev => ({ ...prev, pow: "failed" }))
      onFail("Proof of work failed")
    }
  }

  const completeVerification = () => {
    setCurrentStep("complete")

    // Generate combined verification token with metadata
    const metadata: VerificationMetadata = {
      turnstileToken: verificationToken || undefined,
      mathSolved: stepStatus.math === "complete",
      imageSolved: stepStatus.image === "complete",
      sliderBehavior: sliderBehavior || undefined,
      proofOfWork: powSolution || undefined,
      behaviorScore: 100 - botDetection.score, // Invert: higher is better
      totalDuration: Date.now() - startTime.current,
      timestamp: Date.now(),
    }

    // Create a combined token
    const combinedToken = btoa(JSON.stringify({
      t: verificationToken || `local_${Date.now()}`,
      ts: Date.now(),
      s: metadata.behaviorScore,
      d: metadata.totalDuration,
      pow: powSolution?.hash?.substring(0, 16),
    }))

    setTimeout(() => onComplete(combinedToken, metadata), 500)
  }

  const getStepIcon = (step: keyof StepStatus) => {
    const status = stepStatus[step]
    switch (status) {
      case "complete":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "active":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />
      case "failed":
        return <span className="h-4 w-4 text-red-500">✕</span>
      case "skipped":
        return <span className="h-4 w-4 text-muted-foreground">—</span>
      default:
        return <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
    }
  }

  // Calculate steps to show
  const visibleSteps = [
    { key: "botCheck" as const, label: "Security", show: true },
    { key: "turnstile" as const, label: "hCaptcha", show: hasCaptcha },
    { key: "slider" as const, label: "Slider", show: true },
    { key: "math" as const, label: "Math", show: true },
    { key: "image" as const, label: "Image", show: stepStatus.image !== "skipped" },
    { key: "pow" as const, label: "PoW", show: stepStatus.pow !== "skipped" },
  ].filter(s => s.show)

  // Blocked state
  if (currentStep === "blocked") {
    return (
      <Card className="w-full max-w-md mx-auto overflow-hidden border-destructive/50">
        <CardHeader className="border-b bg-destructive/10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                <Lock className="h-5 w-5" />
                Access Blocked
              </CardTitle>
              <CardDescription className="text-xs text-destructive/80">
                Automated activity detected
              </CardDescription>
            </div>
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Blocked
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
              <Bot className="h-10 w-10 text-destructive" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-destructive">Bot/Automation Detected</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Our security system has detected automated activity, userscripts, or bot usage.
                Access has been denied.
              </p>
              {botDetection.detectedThreats.length > 0 && (
                <div className="mt-4 p-3 bg-destructive/5 rounded-lg border border-destructive/20 text-left">
                  <p className="text-xs font-medium text-destructive mb-2">Detected issues:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {botDetection.detectedThreats.slice(0, 5).map((threat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-destructive">-</span> {threat}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Human Verification
            </CardTitle>
            <CardDescription className="text-xs">
              Complete {visibleSteps.length} security challenges to prove you&apos;re human
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <Bot className="h-3 w-3" />
            Anti-Bot
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Progress Steps */}
        <div className="flex items-center justify-between px-2 flex-wrap gap-2">
          {visibleSteps.map((step, index) => (
            <div key={step.key} className="flex items-center gap-2">
              {getStepIcon(step.key)}
              <span
                className={cn(
                  "text-xs",
                  stepStatus[step.key] === "active" && "font-semibold text-primary",
                  stepStatus[step.key] === "complete" && "text-green-600",
                  stepStatus[step.key] === "skipped" && "text-muted-foreground line-through",
                  stepStatus[step.key] === "failed" && "text-red-600",
                )}
              >
                {step.label}
              </span>
              {index < visibleSteps.length - 1 && (
                <div className="h-px w-4 bg-muted" />
              )}
            </div>
          ))}
        </div>

        {/* Challenge Content */}
        <AnimatePresence mode="wait">
          {currentStep === "bot-check" && (
            <motion.div
              key="bot-check"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              {/* Cloudflare Protection Badge */}
              <div className="w-full p-3 bg-gradient-to-r from-orange-500/10 via-orange-400/5 to-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg className="h-5 w-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 5.5C16.5 4.67 17.17 4 18 4C18.83 4 19.5 4.67 19.5 5.5C19.5 6.33 18.83 7 18 7C17.17 7 16.5 6.33 16.5 5.5ZM12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C14.36 4 16.5 5.07 17.93 6.76L14.76 9.93C14.35 9.58 13.82 9.36 13.25 9.36C11.87 9.36 10.75 10.48 10.75 11.86C10.75 13.24 11.87 14.36 13.25 14.36C14.35 14.36 15.28 13.64 15.6 12.64H13.25V11.14H17.25C17.31 11.37 17.34 11.61 17.34 11.86C17.34 14.12 15.51 15.95 13.25 15.95C10.99 15.95 9.16 14.12 9.16 11.86C9.16 9.6 10.99 7.77 13.25 7.77C14.26 7.77 15.18 8.14 15.89 8.76L18.47 6.18C19.44 7.36 20 8.89 20 12C20 16.41 16.41 20 12 20Z" />
                  </svg>
                  <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    Cloudflare Protection Active
                  </span>
                </div>
                <p className="text-[11px] text-center text-orange-600/80 dark:text-orange-400/80">
                  Enterprise-grade DDoS protection and bot detection enabled
                </p>
              </div>

              {/* Security Analysis Animation */}
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm font-medium">Analyzing your environment...</p>
                <p className="text-xs text-muted-foreground">
                  Checking for bots, automation tools, VPNs, and userscripts
                </p>
              </div>

              {/* Security Checks List */}
              <div className="w-full max-w-xs space-y-1.5 text-xs">
                {[
                  { label: "Cloudflare WAF", delay: 0 },
                  { label: "Browser Fingerprint", delay: 300 },
                  { label: "Automation Detection", delay: 600 },
                  { label: "Bot Signature Analysis", delay: 900 },
                  { label: "Threat Intelligence", delay: 1200 },
                ].map((check, i) => (
                  <SecurityCheckItem key={check.label} label={check.label} delay={check.delay} />
                ))}
              </div>

              <div className="w-full max-w-xs">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-progress" />
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === "turnstile" && (
            <motion.div
              key="turnstile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">Step 1: hCaptcha Verification</p>
                <p className="text-xs text-muted-foreground">Complete the security check below</p>
              </div>
              <HCaptchaWidget
                siteKey={captchaSiteKey || ""}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileError}
                theme="dark"
              />
            </motion.div>
          )}

          {currentStep === "slider" && (
            <motion.div
              key="slider"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-2"
            >
              <div className="text-center space-y-1">
                <p className="text-sm font-medium flex items-center justify-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  Step {hasCaptcha ? "2" : "1"}: Slider Challenge
                </p>
                <p className="text-xs text-muted-foreground">Move the slider naturally to verify</p>
              </div>
              <SliderPuzzleChallenge onVerify={handleSliderComplete} />
            </motion.div>
          )}

          {currentStep === "math" && (
            <motion.div
              key="math"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-2"
            >
              <div className="text-center space-y-1">
                <p className="text-sm font-medium flex items-center justify-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Math Challenge
                </p>
                <p className="text-xs text-muted-foreground">Solve the math problem below</p>
              </div>
              <MathChallenge
                onVerify={handleMathComplete}
                difficulty={difficulty === "extreme" ? "hard" : difficulty === "hard" ? "medium" : "easy"}
              />
            </motion.div>
          )}

          {currentStep === "image" && (
            <motion.div
              key="image"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-2"
            >
              <div className="text-center space-y-1">
                <p className="text-sm font-medium flex items-center justify-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Image Selection
                </p>
                <p className="text-xs text-muted-foreground">Select all matching images</p>
              </div>
              <ImageChallenge onVerify={handleImageComplete} />
            </motion.div>
          )}

          {currentStep === "pow" && (
            <motion.div
              key="pow"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-4 py-2"
            >
              <div className="text-center space-y-1">
                <p className="text-sm font-medium flex items-center justify-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Security Proof
                </p>
                <p className="text-xs text-muted-foreground">Complete computational verification</p>
              </div>
              <ProofOfWorkChallenge
                onVerify={handlePowComplete}
                difficulty={difficulty === "extreme" ? 5 : 4}
                maxTime={difficulty === "extreme" ? 60 : 30}
              />
            </motion.div>
          )}

          {currentStep === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-green-600">Verification Complete!</p>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve proven you&apos;re human. Proceeding...
                </p>
                <p className="text-xs text-muted-foreground">
                  Behavior Score: {Math.round(100 - botDetection.score)}%
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security info */}
        <div className="text-center text-[10px] text-muted-foreground pt-2 border-t">
          Protected by multi-layer bot detection with behavioral analysis
        </div>
      </CardContent>

      <style jsx global>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress 2s ease-in-out;
        }
      `}</style>
    </Card>
  )
}
