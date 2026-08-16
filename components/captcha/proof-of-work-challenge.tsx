"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Cpu, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProofOfWorkChallengeProps {
  onVerify: (success: boolean, solution?: { nonce: number; hash: string; duration: number }) => void
  difficulty?: number // Number of leading zeros required (default: 4)
  maxTime?: number // Maximum time in seconds (default: 30)
}

// =====================================================
// PROOF OF WORK CHALLENGE
// Requires computational work that bots can't easily skip
// =====================================================

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export function ProofOfWorkChallenge({
  onVerify,
  difficulty = 4,
  maxTime = 30,
}: ProofOfWorkChallengeProps) {
  const [challenge, setChallenge] = useState<string>("")
  const [prefix, setPrefix] = useState<string>("")
  const [status, setStatus] = useState<"idle" | "working" | "success" | "failed" | "timeout">("idle")
  const [progress, setProgress] = useState(0)
  const [hashesComputed, setHashesComputed] = useState(0)
  const [hashRate, setHashRate] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [solution, setSolution] = useState<{ nonce: number; hash: string } | null>(null)
  
  const workerRef = useRef<Worker | null>(null)
  const startTimeRef = useRef<number>(0)
  const isCancelled = useRef(false)

  // Generate a new challenge
  const generateChallenge = useCallback(() => {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const challengeStr = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
    setChallenge(challengeStr)
    setPrefix("0".repeat(difficulty))
    setStatus("idle")
    setProgress(0)
    setHashesComputed(0)
    setHashRate(0)
    setTimeElapsed(0)
    setSolution(null)
  }, [difficulty])

  useEffect(() => {
    generateChallenge()
  }, [generateChallenge])

  // Solve the proof of work (runs in main thread with yielding)
  const solveProofOfWork = useCallback(async () => {
    if (!challenge || !prefix) return

    setStatus("working")
    startTimeRef.current = Date.now()
    isCancelled.current = false

    const maxIterations = 10000000
    const batchSize = 5000 // Process in batches to update UI
    let nonce = 0
    let found = false
    let resultHash = ""
    const startTime = Date.now()

    // Timer for timeout and progress updates
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      setTimeElapsed(elapsed)
      
      // Calculate progress based on time
      const timeProgress = Math.min((elapsed / maxTime) * 100, 100)
      setProgress(timeProgress)
      
      if (elapsed >= maxTime) {
        isCancelled.current = true
        clearInterval(timerInterval)
        setStatus("timeout")
        onVerify(false)
      }
    }, 100)

    // Hash rate calculation
    let lastHashCount = 0
    let lastTime = Date.now()
    const rateInterval = setInterval(() => {
      const now = Date.now()
      const dt = (now - lastTime) / 1000
      if (dt > 0) {
        setHashRate(Math.round((nonce - lastHashCount) / dt))
        lastHashCount = nonce
        lastTime = now
      }
    }, 500)

    try {
      while (nonce < maxIterations && !found && !isCancelled.current) {
        // Process a batch
        for (let i = 0; i < batchSize && !found && !isCancelled.current; i++) {
          const data = `${challenge}:${nonce}`
          const hash = await sha256(data)
          
          if (hash.startsWith(prefix)) {
            found = true
            resultHash = hash
            break
          }
          nonce++
        }

        setHashesComputed(nonce)

        // Yield to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      clearInterval(timerInterval)
      clearInterval(rateInterval)

      if (found && !isCancelled.current) {
        const duration = Date.now() - startTime
        setSolution({ nonce, hash: resultHash })
        setStatus("success")
        setProgress(100)
        
        setTimeout(() => {
          onVerify(true, { nonce, hash: resultHash, duration })
        }, 1000)
      } else if (!isCancelled.current) {
        setStatus("failed")
        onVerify(false)
      }
    } catch (error) {
      clearInterval(timerInterval)
      clearInterval(rateInterval)
      setStatus("failed")
      onVerify(false)
    }
  }, [challenge, prefix, maxTime, onVerify])

  const handleStart = () => {
    if (status === "working") return
    solveProofOfWork()
  }

  const handleRetry = () => {
    isCancelled.current = true
    generateChallenge()
  }

  return (
    <Card className="w-full max-w-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <span className="font-semibold">Security Check</span>
        </div>
        {status !== "working" && status !== "success" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRetry}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="text-center py-2">
        <p className="text-sm text-muted-foreground mb-2">
          {status === "idle" && "Click Start to verify you're human"}
          {status === "working" && "Computing security proof..."}
          {status === "success" && "Verification complete!"}
          {status === "failed" && "Verification failed"}
          {status === "timeout" && "Verification timed out"}
        </p>
        
        {status === "working" && (
          <div className="space-y-3">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{hashRate.toLocaleString()} H/s</span>
              <span>{hashesComputed.toLocaleString()} hashes</span>
              <span>{timeElapsed.toFixed(1)}s / {maxTime}s</span>
            </div>
          </div>
        )}

        {status === "success" && solution && (
          <div className="mt-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Proof verified!</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
              Hash: {solution.hash.substring(0, 16)}...
            </p>
          </div>
        )}

        {(status === "failed" || status === "timeout") && (
          <div className="mt-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">
                {status === "timeout" ? "Time expired" : "Verification failed"}
              </span>
            </div>
          </div>
        )}
      </div>

      {status === "idle" && (
        <Button onClick={handleStart} className="w-full">
          Start Verification
        </Button>
      )}

      {status === "working" && (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Computing...
        </Button>
      )}

      {(status === "failed" || status === "timeout") && (
        <Button onClick={handleRetry} variant="outline" className="w-full">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}

      <p className="text-[10px] text-center text-muted-foreground">
        This proof-of-work challenge helps prevent automated abuse.
        It should complete in a few seconds on most devices.
      </p>
    </Card>
  )
}
