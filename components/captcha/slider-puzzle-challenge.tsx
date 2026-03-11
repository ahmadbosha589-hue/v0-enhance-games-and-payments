"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Puzzle, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SliderPuzzleChallengeProps {
  onVerify: (success: boolean, behaviorData?: SliderBehaviorData) => void
}

export interface SliderBehaviorData {
  startX: number
  endX: number
  duration: number
  movements: { x: number; y: number; t: number }[]
  pauses: number
  acceleration: number[]
  isHumanLike: boolean
}

const PUZZLE_WIDTH = 280
const SLIDER_SIZE = 44
const TARGET_TOLERANCE = 12
const MAX_ATTEMPTS = 3

export function SliderPuzzleChallenge({ onVerify }: SliderPuzzleChallengeProps) {
  const [targetPosition, setTargetPosition] = useState(0)
  const [sliderPosition, setSliderPosition] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<"pending" | "verifying" | "correct" | "incorrect">("pending")
  const [attempts, setAttempts] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startTimeRef = useRef(0)
  const movementsRef = useRef<{ x: number; y: number; t: number }[]>([])
  const offsetRef = useRef(0)

  // Generate random target position
  const generatePuzzle = useCallback(() => {
    const maxPos = PUZZLE_WIDTH - SLIDER_SIZE - 50
    const minPos = 80
    const newTarget = Math.floor(Math.random() * (maxPos - minPos)) + minPos
    setTargetPosition(newTarget)
    setSliderPosition(0)
    setStatus("pending")
    movementsRef.current = []
  }, [])

  useEffect(() => {
    generatePuzzle()
  }, [generatePuzzle])

  // Get client X from event
  const getClientX = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): number => {
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0]
      return touch?.clientX ?? 0
    }
    return (e as MouseEvent).clientX
  }

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (status !== "pending") return
    e.preventDefault()
    e.stopPropagation()

    const clientX = getClientX(e)
    const trackRect = trackRef.current?.getBoundingClientRect()

    if (trackRect) {
      // Calculate offset from slider center
      offsetRef.current = clientX - trackRect.left - sliderPosition - SLIDER_SIZE / 2
    }

    startXRef.current = clientX
    startTimeRef.current = Date.now()
    movementsRef.current = [{ x: sliderPosition, y: 0, t: 0 }]
    setIsDragging(true)
  }, [status, sliderPosition])

  // Handle drag movement
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || status !== "pending") return
    e.preventDefault()

    const clientX = getClientX(e)
    const trackRect = trackRef.current?.getBoundingClientRect()

    if (!trackRect) return

    // Calculate new position relative to track
    let newPosition = clientX - trackRect.left - SLIDER_SIZE / 2 - offsetRef.current

    // Clamp position
    const maxSlide = PUZZLE_WIDTH - SLIDER_SIZE
    newPosition = Math.max(0, Math.min(maxSlide, newPosition))

    // Record movement
    const now = Date.now()
    movementsRef.current.push({
      x: newPosition,
      y: 0,
      t: now - startTimeRef.current,
    })

    setSliderPosition(newPosition)
  }, [isDragging, status])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging || status !== "pending") return
    setIsDragging(false)

    // Don't verify if slider wasn't moved much
    if (sliderPosition < 20) {
      return
    }

    setStatus("verifying")

    const duration = Date.now() - startTimeRef.current
    const movements = movementsRef.current

    // Simple human check - relaxed for all devices
    const isHumanLike = movements.length >= 2 && duration >= 80

    setTimeout(() => {
      const isCorrect = Math.abs(sliderPosition - targetPosition) <= TARGET_TOLERANCE

      const behaviorData: SliderBehaviorData = {
        startX: 0,
        endX: sliderPosition,
        duration,
        movements,
        pauses: 0,
        acceleration: [],
        isHumanLike,
      }

      if (isCorrect) {
        setStatus("correct")
        setTimeout(() => onVerify(true, behaviorData), 500)
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setStatus("incorrect")

        if (newAttempts >= MAX_ATTEMPTS) {
          setTimeout(() => onVerify(false, behaviorData), 600)
        } else {
          setTimeout(() => {
            generatePuzzle()
          }, 1000)
        }
      }
    }, 300)
  }, [isDragging, status, sliderPosition, targetPosition, attempts, onVerify, generatePuzzle])

  // Add global event listeners for drag
  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      handleDragMove(e)
    }

    const handleEnd = () => {
      handleDragEnd()
    }

    // Mouse events
    document.addEventListener("mousemove", handleMove, { passive: false })
    document.addEventListener("mouseup", handleEnd)
    document.addEventListener("mouseleave", handleEnd)

    // Touch events
    document.addEventListener("touchmove", handleMove, { passive: false })
    document.addEventListener("touchend", handleEnd)
    document.addEventListener("touchcancel", handleEnd)

    return () => {
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseup", handleEnd)
      document.removeEventListener("mouseleave", handleEnd)
      document.removeEventListener("touchmove", handleMove)
      document.removeEventListener("touchend", handleEnd)
      document.removeEventListener("touchcancel", handleEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  // Calculate match percentage for visual feedback
  const distance = Math.abs(sliderPosition - targetPosition)
  const isClose = distance < TARGET_TOLERANCE * 2
  const isVeryClose = distance < TARGET_TOLERANCE

  return (
    <Card className="w-full max-w-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-primary" />
          <span className="font-semibold">Slide to Verify</span>
        </div>
        {status === "pending" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={generatePuzzle}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground text-center">
        Drag the slider to match the target area
      </p>

      {/* Puzzle Area */}
      <div
        ref={containerRef}
        className="relative h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden select-none"
        style={{ width: PUZZLE_WIDTH }}
      >
        {/* Grid background */}
        <div className="absolute inset-0 grid grid-cols-7 grid-rows-3 opacity-20">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} className="border border-foreground/10" />
          ))}
        </div>

        {/* Target area */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-12 w-12 rounded-lg border-2 transition-all duration-200",
            status === "correct"
              ? "border-green-500 bg-green-500/40"
              : status === "incorrect"
                ? "border-red-500 bg-red-500/40"
                : isVeryClose && isDragging
                  ? "border-green-400 bg-green-400/30 scale-105"
                  : isClose && isDragging
                    ? "border-yellow-400 bg-yellow-400/20"
                    : "border-primary/60 bg-primary/20"
          )}
          style={{ left: targetPosition }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {status === "correct" && <CheckCircle className="h-6 w-6 text-green-500" />}
            {status === "incorrect" && <XCircle className="h-6 w-6 text-red-500" />}
            {status === "verifying" && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
          </div>
        </div>
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-14 bg-muted rounded-lg overflow-hidden select-none"
        style={{
          width: PUZZLE_WIDTH,
          touchAction: "none"
        }}
      >
        {/* Progress fill */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-all duration-75",
            isVeryClose && isDragging ? "bg-green-500/30" : "bg-primary/20"
          )}
          style={{ width: sliderPosition + SLIDER_SIZE / 2 }}
        />

        {/* Slider handle */}
        <div
          ref={sliderRef}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-11 w-11 rounded-lg",
            "bg-gradient-to-br from-primary to-primary/70 shadow-lg",
            "flex items-center justify-center text-primary-foreground",
            "cursor-grab active:cursor-grabbing",
            "transition-transform hover:scale-105",
            isDragging && "scale-110 shadow-xl ring-2 ring-primary/50",
            status !== "pending" && "pointer-events-none opacity-70"
          )}
          style={{
            left: sliderPosition + 2,
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none"
          }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>

        {/* Instructions */}
        {status === "pending" && sliderPosition < 15 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none pl-14">
            <span className="text-sm text-muted-foreground font-medium">
              Slide to complete
            </span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Attempt {attempts + 1} of {MAX_ATTEMPTS}</span>
        {status === "correct" && (
          <span className="text-green-600 font-semibold">Verified!</span>
        )}
        {status === "incorrect" && attempts < MAX_ATTEMPTS && (
          <span className="text-amber-500 font-medium">Try again...</span>
        )}
        {status === "incorrect" && attempts >= MAX_ATTEMPTS && (
          <span className="text-red-500 font-medium">Failed</span>
        )}
        {status === "pending" && isDragging && isVeryClose && (
          <span className="text-green-500 font-medium">Release now!</span>
        )}
        {status === "pending" && isDragging && isClose && !isVeryClose && (
          <span className="text-yellow-500 font-medium">Almost there...</span>
        )}
      </div>
    </Card>
  )
}
