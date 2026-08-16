"use client"

import { useState, useEffect, useCallback, useRef, useId } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, CheckCircle, XCircle, Loader2, GripVertical } from "lucide-react"
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

const PUZZLE_WIDTH = 300
const PUZZLE_HEIGHT = 160
const PIECE_SIZE = 50
const TARGET_TOLERANCE = 8
const MAX_ATTEMPTS = 3

// Background patterns for variety
const PATTERNS = [
  "from-blue-500/20 via-purple-500/20 to-pink-500/20",
  "from-emerald-500/20 via-teal-500/20 to-cyan-500/20",
  "from-orange-500/20 via-amber-500/20 to-yellow-500/20",
  "from-rose-500/20 via-pink-500/20 to-fuchsia-500/20",
  "from-indigo-500/20 via-blue-500/20 to-sky-500/20",
]

export function SliderPuzzleChallenge({ onVerify }: SliderPuzzleChallengeProps) {
  const uniqueId = useId()
  const [targetX, setTargetX] = useState(0)
  const [targetY, setTargetY] = useState(0)
  const [sliderPosition, setSliderPosition] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<"pending" | "verifying" | "correct" | "incorrect">("pending")
  const [attempts, setAttempts] = useState(0)
  const [pattern, setPattern] = useState(0)

  // Unique IDs for SVG elements to prevent conflicts
  const cutoutId = `cutout-${uniqueId}`
  const pieceId = `piece-${uniqueId}`
  const gradientId = `pieceGradient-${uniqueId}`

  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startTimeRef = useRef(0)
  const movementsRef = useRef<{ x: number; y: number; t: number }[]>([])
  const offsetRef = useRef(0)

  // Generate random puzzle
  const generatePuzzle = useCallback(() => {
    // Random target position on X axis (where the cutout will be)
    const minX = 100
    const maxX = PUZZLE_WIDTH - PIECE_SIZE - 30
    const newTargetX = Math.floor(Math.random() * (maxX - minX)) + minX

    // Random Y position for vertical variety
    const minY = 20
    const maxY = PUZZLE_HEIGHT - PIECE_SIZE - 20
    const newTargetY = Math.floor(Math.random() * (maxY - minY)) + minY

    setTargetX(newTargetX)
    setTargetY(newTargetY)
    setSliderPosition(0)
    setStatus("pending")
    setPattern(Math.floor(Math.random() * PATTERNS.length))
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
      offsetRef.current = clientX - trackRect.left - sliderPosition - 24
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

    let newPosition = clientX - trackRect.left - 24 - offsetRef.current
    const maxSlide = PUZZLE_WIDTH - PIECE_SIZE
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

    if (sliderPosition < 15) return

    setStatus("verifying")

    const duration = Date.now() - startTimeRef.current
    const movements = movementsRef.current
    const isHumanLike = movements.length >= 2 && duration >= 80

    setTimeout(() => {
      const isCorrect = Math.abs(sliderPosition - targetX) <= TARGET_TOLERANCE

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
        setTimeout(() => onVerify(true, behaviorData), 600)
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setStatus("incorrect")

        if (newAttempts >= MAX_ATTEMPTS) {
          setTimeout(() => onVerify(false, behaviorData), 600)
        } else {
          setTimeout(() => generatePuzzle(), 1200)
        }
      }
    }, 400)
  }, [isDragging, status, sliderPosition, targetX, attempts, onVerify, generatePuzzle])

  // Global event listeners
  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => handleDragMove(e)
    const handleEnd = () => handleDragEnd()

    document.addEventListener("mousemove", handleMove, { passive: false })
    document.addEventListener("mouseup", handleEnd)
    document.addEventListener("mouseleave", handleEnd)
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

  // Visual feedback calculations
  const distance = Math.abs(sliderPosition - targetX)
  const isClose = distance < TARGET_TOLERANCE * 3
  const isVeryClose = distance < TARGET_TOLERANCE

  // Puzzle piece SVG path for the notch
  const puzzlePiecePath = `
    M 0 10
    L 0 0
    L ${PIECE_SIZE - 10} 0
    L ${PIECE_SIZE - 10} 5
    C ${PIECE_SIZE - 10} 5, ${PIECE_SIZE} 5, ${PIECE_SIZE} 15
    C ${PIECE_SIZE} 25, ${PIECE_SIZE - 10} 25, ${PIECE_SIZE - 10} 25
    L ${PIECE_SIZE - 10} ${PIECE_SIZE}
    L 0 ${PIECE_SIZE}
    L 0 35
    C 0 35, 10 35, 10 25
    C 10 15, 0 15, 0 15
    Z
  `

  return (
    <Card className="w-full max-w-[340px] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
            </svg>
          </div>
          <span className="font-semibold text-sm">Complete the Puzzle</span>
        </div>
        {status === "pending" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={generatePuzzle}
            className="h-7 w-7"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Puzzle Image Area */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden select-none border border-border/50"
        style={{ width: PUZZLE_WIDTH, height: PUZZLE_HEIGHT }}
      >
        {/* Background with gradient pattern */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br",
          PATTERNS[pattern]
        )}>
          {/* Decorative shapes */}
          <div className="absolute inset-0">
            <div className="absolute top-4 left-8 w-16 h-16 rounded-full bg-foreground/5" />
            <div className="absolute bottom-6 right-12 w-20 h-20 rounded-full bg-foreground/5" />
            <div className="absolute top-1/2 left-1/3 w-12 h-12 rotate-45 bg-foreground/5" />
            <div className="absolute bottom-4 left-16 w-8 h-8 rounded-full bg-foreground/5" />
            <div className="absolute top-8 right-20 w-10 h-10 rotate-12 bg-foreground/5" />
          </div>

          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          />
        </div>

        {/* Cutout hole (target area) - where piece should go */}
        <div
          className={cn(
            "absolute transition-all duration-200",
            status === "correct" && "opacity-0"
          )}
          style={{
            left: targetX,
            top: targetY,
            width: PIECE_SIZE,
            height: PIECE_SIZE,
          }}
        >
          <svg width={PIECE_SIZE + 10} height={PIECE_SIZE + 10} className="absolute -left-1 -top-1">
            <defs>
              <clipPath id={cutoutId}>
                <path d={puzzlePiecePath} />
              </clipPath>
            </defs>
            <rect
              x="0"
              y="0"
              width={PIECE_SIZE + 10}
              height={PIECE_SIZE + 10}
              fill="rgba(0,0,0,0.4)"
              clipPath={`url(#${cutoutId})`}
            />
            <path
              d={puzzlePiecePath}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Draggable puzzle piece */}
        <div
          className={cn(
            "absolute transition-transform duration-75",
            isDragging && "scale-105",
            status === "correct" && "opacity-100",
            status === "incorrect" && "opacity-80"
          )}
          style={{
            left: sliderPosition,
            top: targetY,
            width: PIECE_SIZE,
            height: PIECE_SIZE,
            pointerEvents: "none",
          }}
        >
          <svg width={PIECE_SIZE + 10} height={PIECE_SIZE + 10} className="absolute -left-1 -top-1 drop-shadow-lg">
            <defs>
              <clipPath id={pieceId}>
                <path d={puzzlePiecePath} />
              </clipPath>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <g clipPath={`url(#${pieceId})`}>
              <rect
                x="0"
                y="0"
                width={PIECE_SIZE + 10}
                height={PIECE_SIZE + 10}
                fill={`url(#${gradientId})`}
              />
              {/* Inner detail */}
              <rect
                x="5"
                y="5"
                width={PIECE_SIZE - 10}
                height={PIECE_SIZE - 10}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
                rx="4"
              />
            </g>
            <path
              d={puzzlePiecePath}
              fill="none"
              stroke={isVeryClose ? "hsl(var(--primary))" : "rgba(255,255,255,0.5)"}
              strokeWidth={isVeryClose ? "2" : "1.5"}
              className={cn(isVeryClose && "drop-shadow-[0_0_8px_hsl(var(--primary))]")}
            />
          </svg>

          {/* Status icon on piece */}
          {status === "correct" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
          )}
          {status === "incorrect" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
          )}
          {status === "verifying" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Slider Track */}
      <div
        ref={trackRef}
        className="relative h-12 bg-muted rounded-lg overflow-hidden select-none"
        style={{
          width: PUZZLE_WIDTH,
          touchAction: "none"
        }}
      >
        {/* Progress fill */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-colors duration-150 rounded-l-lg",
            status === "correct"
              ? "bg-green-500/30"
              : status === "incorrect"
                ? "bg-red-500/30"
                : isVeryClose
                  ? "bg-green-500/20"
                  : isClose
                    ? "bg-yellow-500/20"
                    : "bg-primary/15"
          )}
          style={{ width: sliderPosition + 24 }}
        />

        {/* Arrow hints */}
        {status === "pending" && sliderPosition < 10 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1 text-muted-foreground/60 animate-pulse pl-12">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span className="text-xs font-medium">Slide to fit the piece</span>
            </div>
          </div>
        )}

        {/* Slider handle */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-10 w-12 rounded-md",
            "bg-gradient-to-r from-primary to-primary/80",
            "flex items-center justify-center text-primary-foreground",
            "cursor-grab active:cursor-grabbing shadow-md",
            "transition-all duration-100",
            isDragging && "scale-105 shadow-lg ring-2 ring-primary/40",
            status === "correct" && "bg-gradient-to-r from-green-500 to-green-600",
            status === "incorrect" && "bg-gradient-to-r from-red-500 to-red-600",
            status !== "pending" && "pointer-events-none"
          )}
          style={{
            left: sliderPosition,
            touchAction: "none",
            userSelect: "none",
          }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <GripVertical className="h-5 w-5 opacity-80" />
        </div>
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Attempt {attempts + 1}/{MAX_ATTEMPTS}
        </span>
        <div className="h-4">
          {status === "correct" && (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Verified
            </span>
          )}
          {status === "incorrect" && attempts < MAX_ATTEMPTS && (
            <span className="text-amber-500 font-medium">Try again</span>
          )}
          {status === "incorrect" && attempts >= MAX_ATTEMPTS && (
            <span className="text-red-500 font-medium">Verification failed</span>
          )}
          {status === "pending" && isDragging && isVeryClose && (
            <span className="text-green-500 font-medium animate-pulse">Release to verify!</span>
          )}
          {status === "pending" && isDragging && isClose && !isVeryClose && (
            <span className="text-yellow-500 font-medium">Getting close...</span>
          )}
        </div>
      </div>
    </Card>
  )
}
