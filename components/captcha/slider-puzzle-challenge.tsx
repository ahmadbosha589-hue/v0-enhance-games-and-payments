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

// =====================================================
// SLIDER PUZZLE CHALLENGE
// Requires human-like mouse movement to solve
// Analyzes movement patterns to detect automation
// =====================================================

const PUZZLE_WIDTH = 280
const SLIDER_SIZE = 44
const TARGET_TOLERANCE = 5 // Pixels of tolerance
const MIN_MOVEMENTS = 5 // Minimum mouse movements required
const MAX_ATTEMPTS = 3

export function SliderPuzzleChallenge({ onVerify }: SliderPuzzleChallengeProps) {
  const [targetPosition, setTargetPosition] = useState(0)
  const [sliderPosition, setSliderPosition] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<"pending" | "verifying" | "correct" | "incorrect">("pending")
  const [attempts, setAttempts] = useState(0)
  
  const sliderRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startTimeRef = useRef(0)
  const movementsRef = useRef<{ x: number; y: number; t: number }[]>([])
  const lastMoveTimeRef = useRef(0)
  const pauseCountRef = useRef(0)
  const velocitiesRef = useRef<number[]>([])
  
  // Generate random target position
  const generatePuzzle = useCallback(() => {
    const maxPos = PUZZLE_WIDTH - SLIDER_SIZE - 40 // Leave room from edges
    const minPos = 60
    const newTarget = Math.floor(Math.random() * (maxPos - minPos)) + minPos
    setTargetPosition(newTarget)
    setSliderPosition(0)
    setStatus("pending")
    movementsRef.current = []
    pauseCountRef.current = 0
    velocitiesRef.current = []
  }, [])
  
  useEffect(() => {
    generatePuzzle()
  }, [generatePuzzle])

  // Analyze behavior to detect bots
  const analyzeBehavior = useCallback((): SliderBehaviorData => {
    const movements = movementsRef.current
    const duration = Date.now() - startTimeRef.current
    
    // Calculate accelerations
    const accelerations: number[] = []
    for (let i = 2; i < velocitiesRef.current.length; i++) {
      const accel = velocitiesRef.current[i] - velocitiesRef.current[i - 1]
      accelerations.push(accel)
    }
    
    // Determine if movement is human-like
    let isHumanLike = true
    
    // Check 1: Too few movements (bot might teleport)
    if (movements.length < MIN_MOVEMENTS) {
      isHumanLike = false
    }
    
    // Check 2: Too fast (< 100ms is suspicious)
    if (duration < 100) {
      isHumanLike = false
    }
    
    // Check 3: No pauses at all (humans naturally pause)
    if (duration > 500 && pauseCountRef.current === 0) {
      isHumanLike = false
    }
    
    // Check 4: Perfectly linear movement (bots don't curve)
    if (movements.length > 10) {
      const yVariance = calculateVariance(movements.map(m => m.y))
      if (yVariance < 1) { // Y should vary slightly for humans
        isHumanLike = false
      }
    }
    
    // Check 5: Constant velocity (humans accelerate/decelerate)
    if (velocitiesRef.current.length > 5) {
      const velVariance = calculateVariance(velocitiesRef.current)
      if (velVariance < 0.5) { // Too consistent
        isHumanLike = false
      }
    }
    
    // Check 6: Impossible speed (> 10000 px/s is inhuman)
    const avgVelocity = velocitiesRef.current.reduce((a, b) => a + b, 0) / 
                        (velocitiesRef.current.length || 1)
    if (avgVelocity > 10000) {
      isHumanLike = false
    }
    
    return {
      startX: movements[0]?.x || 0,
      endX: movements[movements.length - 1]?.x || 0,
      duration,
      movements,
      pauses: pauseCountRef.current,
      acceleration: accelerations,
      isHumanLike,
    }
  }, [])
  
  const calculateVariance = (values: number[]): number => {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  }

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== "pending") return
    
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    startXRef.current = clientX - sliderPosition
    startTimeRef.current = Date.now()
    lastMoveTimeRef.current = Date.now()
    movementsRef.current = []
    pauseCountRef.current = 0
    velocitiesRef.current = []
    setIsDragging(true)
  }

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || status !== "pending") return
    
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    const now = Date.now()
    
    // Record movement
    const newX = clientX - startXRef.current
    movementsRef.current.push({
      x: newX,
      y: clientY,
      t: now - startTimeRef.current,
    })
    
    // Calculate velocity
    const dt = now - lastMoveTimeRef.current
    if (dt > 0) {
      const lastMove = movementsRef.current[movementsRef.current.length - 2]
      if (lastMove) {
        const dx = newX - lastMove.x
        const velocity = Math.abs(dx / dt) * 1000 // px/s
        velocitiesRef.current.push(velocity)
      }
      
      // Detect pauses (> 50ms between movements)
      if (dt > 50) {
        pauseCountRef.current++
      }
    }
    lastMoveTimeRef.current = now
    
    // Update position
    const maxSlide = PUZZLE_WIDTH - SLIDER_SIZE
    const newPosition = Math.max(0, Math.min(maxSlide, newX))
    setSliderPosition(newPosition)
  }, [isDragging, status])

  const handleMouseUp = useCallback(() => {
    if (!isDragging || status !== "pending") return
    setIsDragging(false)
    
    // Verify position
    setStatus("verifying")
    
    setTimeout(() => {
      const isCorrect = Math.abs(sliderPosition - targetPosition) <= TARGET_TOLERANCE
      const behaviorData = analyzeBehavior()
      
      // Must be both correct position AND human-like behavior
      if (isCorrect && behaviorData.isHumanLike) {
        setStatus("correct")
        setTimeout(() => onVerify(true, behaviorData), 800)
      } else {
        setAttempts(prev => prev + 1)
        setStatus("incorrect")
        
        if (attempts + 1 >= MAX_ATTEMPTS) {
          setTimeout(() => onVerify(false, behaviorData), 1000)
        } else {
          setTimeout(() => {
            generatePuzzle()
          }, 1500)
        }
      }
    }, 500)
  }, [isDragging, status, sliderPosition, targetPosition, analyzeBehavior, attempts, onVerify, generatePuzzle])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.addEventListener("touchmove", handleMouseMove)
      document.addEventListener("touchend", handleMouseUp)
      
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.removeEventListener("touchmove", handleMouseMove)
        document.removeEventListener("touchend", handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <Card className="w-full max-w-sm p-6 space-y-4">
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

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Slide the puzzle piece to the highlighted area
        </p>
      </div>

      {/* Puzzle Area */}
      <div 
        ref={containerRef}
        className="relative h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 overflow-hidden"
        style={{ width: PUZZLE_WIDTH }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-8 h-8 border border-foreground/20"
              style={{
                left: (i % 5) * 56,
                top: Math.floor(i / 5) * 24,
              }}
            />
          ))}
        </div>
        
        {/* Target area (where user should slide to) */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-14 w-14 rounded-lg border-2 transition-all duration-300",
            status === "correct" 
              ? "border-green-500 bg-green-500/30" 
              : status === "incorrect"
                ? "border-red-500 bg-red-500/30"
                : "border-primary bg-primary/20 animate-pulse"
          )}
          style={{ left: targetPosition }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {status === "correct" && <CheckCircle className="h-6 w-6 text-green-500" />}
            {status === "incorrect" && <XCircle className="h-6 w-6 text-red-500" />}
            {status === "verifying" && <Loader2 className="h-6 w-6 text-primary animate-spin" />}
          </div>
        </div>
      </div>

      {/* Slider track */}
      <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
        <div 
          className="absolute inset-y-0 left-0 bg-primary/20 transition-all"
          style={{ width: sliderPosition + SLIDER_SIZE / 2 }}
        />
        
        {/* Slider handle */}
        <div
          ref={sliderRef}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-lg cursor-grab active:cursor-grabbing",
            "bg-gradient-to-br from-primary to-primary/80 shadow-lg",
            "flex items-center justify-center text-primary-foreground",
            "transition-transform hover:scale-105",
            status !== "pending" && "pointer-events-none opacity-80"
          )}
          style={{ left: sliderPosition + 2 }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9l4-4 4 4" />
            <path d="M5 15l4 4 4-4" />
            <path d="M11 9l4-4 4 4" />
            <path d="M11 15l4 4 4-4" />
          </svg>
        </div>
        
        {/* Instructions text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={cn(
            "text-sm text-muted-foreground transition-opacity",
            sliderPosition > 30 && "opacity-0"
          )}>
            {">>>  Drag to verify  >>>"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Attempts: {attempts}/{MAX_ATTEMPTS}</span>
        {status === "correct" && (
          <span className="text-green-600 font-medium">Verified!</span>
        )}
        {status === "incorrect" && attempts < MAX_ATTEMPTS && (
          <span className="text-amber-500">Try again</span>
        )}
      </div>

      {status === "correct" && (
        <p className="text-center text-sm text-green-600 font-medium">
          Human verification successful!
        </p>
      )}
      {status === "incorrect" && attempts >= MAX_ATTEMPTS && (
        <p className="text-center text-sm text-red-600 font-medium">
          Verification failed - too many attempts
        </p>
      )}
    </Card>
  )
}
