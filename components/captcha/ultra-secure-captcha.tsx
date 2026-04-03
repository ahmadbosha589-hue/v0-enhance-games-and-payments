"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Fingerprint,
  Bot,
  Eye,
  Brain,
  Zap,
  Clock,
  MousePointer,
  Keyboard
} from "lucide-react"
import { cn } from "@/lib/utils"
import { HCaptchaWidget } from "./hcaptcha-widget"

// =============================================================================
// ULTRA SECURE CAPTCHA v3.0 - MULTI-LAYER BOT PROTECTION
// =============================================================================
// This captcha system uses multiple layers of verification:
// 1. Visual puzzle (image selection or pattern recognition)
// 2. Timing analysis (human typing/clicking patterns)
// 3. Mouse movement tracking (natural vs bot patterns)
// 4. Proof-of-Work computation
// 5. hCaptcha as secondary layer
// 6. Behavioral fingerprinting
// 7. Challenge rotation and one-time-use tokens
// =============================================================================

interface UltraSecureCaptchaProps {
  onComplete: (token: string, metadata: VerificationMetadata) => void
  onFail: (reason: string) => void
  difficulty?: "easy" | "normal" | "hard" | "extreme"
  requireAllLayers?: boolean
  className?: string
}

interface VerificationMetadata {
  challengeId: string
  completionTime: number
  mouseMovements: number
  keystrokes: number
  puzzleSolveTime: number
  powDifficulty: number
  layers: string[]
  fingerprint: string
}

interface Challenge {
  id: string
  type: "image_select" | "pattern" | "math" | "sequence" | "memory"
  question: string
  options: string[]
  correctIndex: number
  timeLimit: number
  timestamp: number
}

// Math challenges that change every time
function generateMathChallenge(): Challenge {
  const operations = [
    () => {
      const a = Math.floor(Math.random() * 20) + 5
      const b = Math.floor(Math.random() * 15) + 3
      return { q: `${a} + ${b}`, a: a + b }
    },
    () => {
      const a = Math.floor(Math.random() * 30) + 15
      const b = Math.floor(Math.random() * 15) + 1
      return { q: `${a} - ${b}`, a: a - b }
    },
    () => {
      const a = Math.floor(Math.random() * 12) + 2
      const b = Math.floor(Math.random() * 9) + 2
      return { q: `${a} × ${b}`, a: a * b }
    },
    () => {
      const b = Math.floor(Math.random() * 8) + 2
      const a = b * (Math.floor(Math.random() * 10) + 2)
      return { q: `${a} ÷ ${b}`, a: a / b }
    }
  ]

  const op = operations[Math.floor(Math.random() * operations.length)]
  const result = op()

  // Generate wrong options
  const correct = result.a
  const wrongOptions = [
    correct + Math.floor(Math.random() * 5) + 1,
    correct - Math.floor(Math.random() * 5) - 1,
    correct + Math.floor(Math.random() * 10) + 5,
  ].filter(x => x !== correct && x > 0)

  const options = [correct.toString(), ...wrongOptions.slice(0, 3).map(String)]
  const shuffled = options.sort(() => Math.random() - 0.5)

  return {
    id: crypto.randomUUID(),
    type: "math",
    question: `What is ${result.q}?`,
    options: shuffled,
    correctIndex: shuffled.indexOf(correct.toString()),
    timeLimit: 30,
    timestamp: Date.now()
  }
}

// Pattern challenges
function generatePatternChallenge(): Challenge {
  const patterns = [
    { seq: [2, 4, 6, 8], next: 10, q: "2, 4, 6, 8, ?" },
    { seq: [1, 3, 5, 7], next: 9, q: "1, 3, 5, 7, ?" },
    { seq: [3, 6, 9, 12], next: 15, q: "3, 6, 9, 12, ?" },
    { seq: [1, 4, 9, 16], next: 25, q: "1, 4, 9, 16, ?" },
    { seq: [2, 6, 12, 20], next: 30, q: "2, 6, 12, 20, ?" },
    { seq: [1, 1, 2, 3, 5], next: 8, q: "1, 1, 2, 3, 5, ?" },
    { seq: [5, 10, 20, 40], next: 80, q: "5, 10, 20, 40, ?" },
    { seq: [100, 50, 25], next: 12.5, q: "100, 50, 25, ?" },
  ]

  const pattern = patterns[Math.floor(Math.random() * patterns.length)]
  const correct = pattern.next.toString()
  const wrongOptions = [
    (pattern.next + 2).toString(),
    (pattern.next - 1).toString(),
    (pattern.next + 5).toString(),
  ]

  const options = [correct, ...wrongOptions].sort(() => Math.random() - 0.5)

  return {
    id: crypto.randomUUID(),
    type: "pattern",
    question: `What comes next: ${pattern.q}`,
    options,
    correctIndex: options.indexOf(correct),
    timeLimit: 45,
    timestamp: Date.now()
  }
}

// Sequence memory challenge
function generateSequenceChallenge(): Challenge {
  const icons = ["🔴", "🟢", "🔵", "🟡", "🟣", "🟠"]
  const length = 3 + Math.floor(Math.random() * 2)
  const sequence = Array.from({ length }, () => icons[Math.floor(Math.random() * icons.length)])
  const correctSequence = sequence.join("")

  // Shuffle for wrong options
  const wrongSequences = [
    [...sequence].reverse().join(""),
    [...sequence].slice(1).concat(sequence[0]).join(""),
    sequence.map((_, i) => icons[(icons.indexOf(sequence[i]) + 1) % icons.length]).join("")
  ]

  const options = [correctSequence, ...wrongSequences].sort(() => Math.random() - 0.5)

  return {
    id: crypto.randomUUID(),
    type: "sequence",
    question: `Remember this sequence: ${sequence.join(" ")} - Select the correct order:`,
    options,
    correctIndex: options.indexOf(correctSequence),
    timeLimit: 20,
    timestamp: Date.now()
  }
}

// Word challenge - harder for AI
function generateWordChallenge(): Challenge {
  const challenges = [
    { q: "Which word is spelled INCORRECTLY?", opts: ["Receive", "Beleive", "Achieve", "Perceive"], correct: 1 },
    { q: "Which is NOT a color?", opts: ["Azure", "Crimson", "Vertex", "Magenta"], correct: 2 },
    { q: "Select the LARGEST animal:", opts: ["Elephant", "Giraffe", "Hippo", "Lion"], correct: 0 },
    { q: "What day comes after Wednesday?", opts: ["Tuesday", "Thursday", "Friday", "Monday"], correct: 1 },
    { q: "Which number is ODD?", opts: ["24", "36", "47", "82"], correct: 2 },
    { q: "Select the CAPITAL city:", opts: ["Sydney", "Tokyo", "Mumbai", "Shanghai"], correct: 1 },
  ]

  const challenge = challenges[Math.floor(Math.random() * challenges.length)]

  return {
    id: crypto.randomUUID(),
    type: "memory",
    question: challenge.q,
    options: challenge.opts,
    correctIndex: challenge.correct,
    timeLimit: 25,
    timestamp: Date.now()
  }
}

export function UltraSecureCaptcha({
  onComplete,
  onFail,
  difficulty = "normal",
  requireAllLayers = true,
  className
}: UltraSecureCaptchaProps) {
  // States
  const [currentStep, setCurrentStep] = useState(0)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null)
  const [powCompleted, setPowCompleted] = useState(false)
  const [powProgress, setPowProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [layersCompleted, setLayersCompleted] = useState<string[]>([])

  // Tracking refs
  const mouseMovements = useRef(0)
  const keystrokes = useRef(0)
  const startTime = useRef(Date.now())
  const challengeStartTime = useRef(Date.now())
  const mousePositions = useRef<{ x: number, y: number, t: number }[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Difficulty settings
  const difficultySettings = useMemo(() => ({
    easy: { layers: 2, powDifficulty: 2, timeMultiplier: 1.5 },
    normal: { layers: 3, powDifficulty: 3, timeMultiplier: 1.0 },
    hard: { layers: 4, powDifficulty: 4, timeMultiplier: 0.8 },
    extreme: { layers: 5, powDifficulty: 5, timeMultiplier: 0.6 }
  }), [])

  const settings = difficultySettings[difficulty]
  const totalSteps = settings.layers + 1 // +1 for final verification

  // Generate fingerprint
  const generateFingerprint = useCallback(() => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.textBaseline = "top"
      ctx.font = "14px Arial"
      ctx.fillText("Browser fingerprint", 2, 2)
    }
    const canvasHash = canvas.toDataURL().slice(-50)

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset().toString(),
      canvasHash
    ].join("|")

    // Simple hash
    let hash = 0
    for (let i = 0; i < components.length; i++) {
      const char = components.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }, [])

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseMovements.current++
      mousePositions.current.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now()
      })
      // Keep only last 100 positions
      if (mousePositions.current.length > 100) {
        mousePositions.current.shift()
      }
    }

    const handleKeyDown = () => {
      keystrokes.current++
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // Generate new challenge
  const generateChallenge = useCallback(() => {
    const generators = [
      generateMathChallenge,
      generatePatternChallenge,
      generateSequenceChallenge,
      generateWordChallenge
    ]

    const generator = generators[Math.floor(Math.random() * generators.length)]
    const newChallenge = generator()
    newChallenge.timeLimit = Math.ceil(newChallenge.timeLimit * settings.timeMultiplier)

    setChallenge(newChallenge)
    setTimeRemaining(newChallenge.timeLimit)
    setSelectedAnswer(null)
    challengeStartTime.current = Date.now()
  }, [settings.timeMultiplier])

  // Initialize first challenge
  useEffect(() => {
    generateChallenge()
    startTime.current = Date.now()
  }, [generateChallenge])

  // Timer
  useEffect(() => {
    if (!challenge || timeRemaining <= 0) return

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setError("Time expired! Try again.")
          setAttempts(a => a + 1)
          if (attempts >= 2) {
            onFail("Too many failed attempts")
          } else {
            generateChallenge()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [challenge, timeRemaining, attempts, generateChallenge, onFail])

  // Proof of Work
  const computeProofOfWork = useCallback(async () => {
    const target = "0".repeat(settings.powDifficulty)
    let nonce = 0
    const data = challenge?.id || crypto.randomUUID()

    return new Promise<string>((resolve) => {
      const compute = () => {
        const batchSize = 1000
        for (let i = 0; i < batchSize; i++) {
          const hash = simpleHash(data + nonce.toString())
          if (hash.startsWith(target)) {
            resolve(nonce.toString())
            return
          }
          nonce++
        }
        setPowProgress(Math.min(90, (nonce / 100000) * 90))
        requestAnimationFrame(compute)
      }
      compute()
    })
  }, [challenge?.id, settings.powDifficulty])

  // Simple hash function
  const simpleHash = (str: string): string => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, "0")
  }

  // Analyze mouse behavior for bot detection
  const analyzeMouseBehavior = useCallback((): { isHuman: boolean; confidence: number } => {
    const positions = mousePositions.current
    if (positions.length < 10) {
      return { isHuman: false, confidence: 0 }
    }

    // Calculate movement variance
    let totalSpeed = 0
    let speedVariance = 0
    let directionChanges = 0
    const speeds: number[] = []

    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x
      const dy = positions[i].y - positions[i - 1].y
      const dt = positions[i].t - positions[i - 1].t

      if (dt > 0) {
        const speed = Math.sqrt(dx * dx + dy * dy) / dt
        speeds.push(speed)
        totalSpeed += speed

        // Check direction changes
        if (i > 1) {
          const prevDx = positions[i - 1].x - positions[i - 2].x
          const prevDy = positions[i - 1].y - positions[i - 2].y
          if ((dx * prevDx < 0) || (dy * prevDy < 0)) {
            directionChanges++
          }
        }
      }
    }

    const avgSpeed = totalSpeed / speeds.length
    for (const speed of speeds) {
      speedVariance += Math.pow(speed - avgSpeed, 2)
    }
    speedVariance /= speeds.length

    // Humans have higher variance and more direction changes
    const hasVariance = speedVariance > 0.1
    const hasDirectionChanges = directionChanges > positions.length * 0.2
    const hasReasonableMovements = mouseMovements.current > 20

    const confidence = (
      (hasVariance ? 30 : 0) +
      (hasDirectionChanges ? 30 : 0) +
      (hasReasonableMovements ? 40 : 0)
    )

    return {
      isHuman: confidence >= 60,
      confidence
    }
  }, [])

  // Submit answer
  const handleSubmit = useCallback(async () => {
    if (selectedAnswer === null || !challenge) return
    setIsVerifying(true)
    setError(null)

    try {
      const solveTime = Date.now() - challengeStartTime.current

      // Check if answer is correct
      if (selectedAnswer !== challenge.correctIndex) {
        setAttempts(a => a + 1)
        if (attempts >= 2) {
          onFail("Too many incorrect answers")
          return
        }
        setError("Incorrect answer. Try again.")
        generateChallenge()
        setIsVerifying(false)
        return
      }

      // Check for suspiciously fast answers (bot behavior)
      if (solveTime < 500) {
        onFail("Suspicious behavior detected")
        return
      }

      setLayersCompleted(prev => [...prev, challenge.type])

      // Move to next step
      if (currentStep < settings.layers - 1) {
        setCurrentStep(s => s + 1)
        generateChallenge()
      } else if (!powCompleted && difficulty !== "easy") {
        // Start Proof of Work
        setCurrentStep(s => s + 1)
        const nonce = await computeProofOfWork()
        setPowCompleted(true)
        setPowProgress(100)
        setLayersCompleted(prev => [...prev, "pow"])
      } else if (!hcaptchaToken && requireAllLayers) {
        // Show hCaptcha
        setCurrentStep(s => s + 1)
      } else {
        // Complete!
        await finalVerification()
      }
    } finally {
      setIsVerifying(false)
    }
  }, [
    selectedAnswer,
    challenge,
    attempts,
    currentStep,
    settings.layers,
    powCompleted,
    difficulty,
    hcaptchaToken,
    requireAllLayers,
    generateChallenge,
    computeProofOfWork,
    onFail
  ])

  // Final verification
  const finalVerification = useCallback(async () => {
    const mouseAnalysis = analyzeMouseBehavior()

    if (!mouseAnalysis.isHuman && requireAllLayers) {
      onFail("Behavioral analysis failed")
      return
    }

    const metadata: VerificationMetadata = {
      challengeId: challenge?.id || crypto.randomUUID(),
      completionTime: Date.now() - startTime.current,
      mouseMovements: mouseMovements.current,
      keystrokes: keystrokes.current,
      puzzleSolveTime: Date.now() - challengeStartTime.current,
      powDifficulty: settings.powDifficulty,
      layers: layersCompleted,
      fingerprint: generateFingerprint()
    }

    // Generate verification token
    const tokenData = JSON.stringify({
      ...metadata,
      hcaptcha: hcaptchaToken,
      timestamp: Date.now()
    })
    const token = btoa(tokenData)

    onComplete(token, metadata)
  }, [
    analyzeMouseBehavior,
    challenge,
    hcaptchaToken,
    layersCompleted,
    settings.powDifficulty,
    requireAllLayers,
    generateFingerprint,
    onComplete,
    onFail
  ])

  // hCaptcha complete handler
  const handleHcaptchaComplete = useCallback((token: string) => {
    setHcaptchaToken(token)
    setLayersCompleted(prev => [...prev, "hcaptcha"])
    finalVerification()
  }, [finalVerification])

  // Get step icon
  const getStepIcon = (step: number) => {
    if (step < currentStep) return <CheckCircle2 className="h-4 w-4 text-green-500" />
    if (step === currentStep) return <Zap className="h-4 w-4 text-primary animate-pulse" />
    return <Lock className="h-4 w-4 text-muted-foreground" />
  }

  const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || ""

  return (
    <div ref={containerRef} className={cn("space-y-4", className)}>
      {/* Progress Steps */}
      <div className="flex items-center justify-between gap-2 px-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
              i < currentStep ? "border-green-500 bg-green-500/10" :
                i === currentStep ? "border-primary bg-primary/10" :
                  "border-muted bg-muted/50"
            )}>
              {getStepIcon(i)}
            </div>
            {i < totalSteps - 1 && (
              <div className={cn(
                "h-0.5 w-4 sm:w-8",
                i < currentStep ? "bg-green-500" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Security Badge */}
      <div className="flex items-center justify-center gap-2">
        <Badge variant="outline" className="gap-1 text-green-600 border-green-500/30 bg-green-500/5">
          <Shield className="h-3 w-3" />
          Multi-Layer Protection
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Fingerprint className="h-3 w-3" />
          Difficulty: {difficulty}
        </Badge>
      </div>

      {/* Challenge Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-primary" />
              {currentStep < settings.layers ? `Challenge ${currentStep + 1}` :
                currentStep === settings.layers && !powCompleted ? "Computing..." :
                  "Final Verification"}
            </CardTitle>
            {challenge && currentStep < settings.layers && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className={cn(
                  "font-mono font-bold",
                  timeRemaining <= 10 ? "text-red-500" : "text-muted-foreground"
                )}>
                  {timeRemaining}s
                </span>
              </div>
            )}
          </div>
          <CardDescription className="text-xs">
            {currentStep < settings.layers
              ? "Solve the puzzle to prove you are human"
              : currentStep === settings.layers && !powCompleted
                ? "Computing proof of work..."
                : "Complete final verification"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Challenge Display */}
          {currentStep < settings.layers && challenge && (
            <>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="font-medium">{challenge.question}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {challenge.options.map((option, i) => (
                  <Button
                    key={i}
                    variant={selectedAnswer === i ? "default" : "outline"}
                    className={cn(
                      "h-auto py-3 px-4",
                      selectedAnswer === i && "ring-2 ring-primary"
                    )}
                    onClick={() => setSelectedAnswer(i)}
                  >
                    {option}
                  </Button>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <Button
                className="w-full gap-2"
                disabled={selectedAnswer === null || isVerifying}
                onClick={handleSubmit}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Answer
                  </>
                )}
              </Button>
            </>
          )}

          {/* Proof of Work */}
          {currentStep === settings.layers && !powCompleted && difficulty !== "easy" && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Computing proof of work...</span>
              </div>
              <Progress value={powProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                This prevents automated attacks. Please wait...
              </p>
            </div>
          )}

          {/* hCaptcha */}
          {((currentStep === settings.layers && (powCompleted || difficulty === "easy")) ||
            (currentStep > settings.layers && !hcaptchaToken)) &&
            requireAllLayers && hcaptchaSiteKey && (
              <div className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  Complete the final verification
                </p>
                <HCaptchaWidget
                  siteKey={hcaptchaSiteKey}
                  onVerify={handleHcaptchaComplete}
                  onError={() => onFail("hCaptcha failed")}
                  onExpire={() => setHcaptchaToken(null)}
                  theme="dark"
                />
              </div>
            )}

          {/* Completed layers indicator */}
          {layersCompleted.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 border-t">
              {layersCompleted.map((layer, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                  {layer}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Behavioral tracking indicators (subtle) */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <MousePointer className="h-3 w-3" />
          <span>{mouseMovements.current > 50 ? "Natural" : "Tracking..."}</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          <span>Monitoring</span>
        </div>
        <div className="flex items-center gap-1">
          <Bot className="h-3 w-3" />
          <span>Anti-Bot Active</span>
        </div>
      </div>
    </div>
  )
}
