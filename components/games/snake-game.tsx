"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  Sparkles
} from "lucide-react"

const BOARD_SIZE = 20  // Larger grid for better gameplay
const CELL_SIZE = 18   // Balanced cell size
const INITIAL_SPEED = 140
const SPEED_INCREASE = 4

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
type Position = { x: number; y: number }
type FoodType = "normal" | "bonus" | "golden" | "speed" | "slow"

interface Food extends Position {
  type: FoodType
  points: number
  expireAt?: number
}

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface SnakeGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number // Score needed to win and get reward
  initialScore?: number
}

const FOOD_TYPES: Record<FoodType, { color: string; points: number; chance: number }> = {
  normal: { color: "#ef4444", points: 10, chance: 0.6 },
  bonus: { color: "#22c55e", points: 25, chance: 0.2 },
  golden: { color: "#fbbf24", points: 50, chance: 0.1 },
  speed: { color: "#3b82f6", points: 15, chance: 0.05 },
  slow: { color: "#a855f7", points: 15, chance: 0.05 },
}

export function SnakeGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 500, initialScore = 0 }: SnakeGameProps) {
  // Apply difficulty - faster snake at higher levels
  const baseSpeed = difficulty ? INITIAL_SPEED / difficulty.speedMultiplier : INITIAL_SPEED
  const baseSpeedRef = useRef(baseSpeed)
  baseSpeedRef.current = baseSpeed
  const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }])
  const [hasWon, setHasWon] = useState(false)
  const [direction, setDirection] = useState<Direction>("RIGHT")
  const [food, setFood] = useState<Food>({ x: 14, y: 10, type: "normal", points: 10 })
  const [bonusFood, setBonusFood] = useState<Food | null>(null)
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const [combo, setCombo] = useState(0)
  const [lastEatTime, setLastEatTime] = useState(0)
  const [speedBoost, setSpeedBoost] = useState(false)
  const [slowMode, setSlowMode] = useState(false)
  const [flashEffect, setFlashEffect] = useState(false)

  const gameLoopRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const directionRef = useRef(direction)
  const directionQueueRef = useRef<Direction[]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef(score)
  const movesRef = useRef(moves)
  const gameOverRef = useRef(gameOver)

  // Keep refs in sync
  useEffect(() => {
    scoreRef.current = score
    movesRef.current = moves
    gameOverRef.current = gameOver
  }, [score, moves, gameOver])

  // Auto-win detection - when score reaches threshold, trigger win
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive) {
      setHasWon(true)
      setGameOver(true)
      onGameEnd(score, moves)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, moves, onGameEnd])

  const getRandomFoodType = (): FoodType => {
    const rand = Math.random()
    let cumulative = 0
    for (const [type, config] of Object.entries(FOOD_TYPES)) {
      cumulative += config.chance
      if (rand < cumulative) return type as FoodType
    }
    return "normal"
  }

  const generateFood = useCallback((): Food => {
    let newPos: Position
    do {
      // Generate food 1 cell away from edges to prevent clipping
      newPos = {
        x: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
        y: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2))
      }
    } while (snake.some(segment => segment.x === newPos.x && segment.y === newPos.y))

    const type = getRandomFoodType()
    return { ...newPos, type, points: FOOD_TYPES[type].points }
  }, [snake])

  const spawnBonusFood = useCallback(() => {
    if (Math.random() < 0.12 && !bonusFood) {
      let newPos: Position
      do {
        // Generate bonus food 1 cell away from edges to prevent clipping
        newPos = {
          x: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2)),
          y: 1 + Math.floor(Math.random() * (BOARD_SIZE - 2))
        }
      } while (
        snake.some(segment => segment.x === newPos.x && segment.y === newPos.y) ||
        (food.x === newPos.x && food.y === newPos.y)
      )

      setBonusFood({
        ...newPos,
        type: "golden",
        points: 100,
        expireAt: Date.now() + 5000
      })
    }
  }, [snake, food, bonusFood])

  const moveSnake = useCallback(() => {
    if (!isActive || isPaused || gameOver) return

    // Process direction queue
    if (directionQueueRef.current.length > 0) {
      const nextDir = directionQueueRef.current.shift()!
      directionRef.current = nextDir
      setDirection(nextDir)
    }

    setSnake(prevSnake => {
      const head = { ...prevSnake[0] }
      const currentDirection = directionRef.current

      switch (currentDirection) {
        case "UP": head.y -= 1; break
        case "DOWN": head.y += 1; break
        case "LEFT": head.x -= 1; break
        case "RIGHT": head.x += 1; break
      }

      // Wall collision - snake dies when hitting any edge
      const hitWall = head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE
      if (hitWall) {
        if (!gameOverRef.current) {
          gameOverRef.current = true
          setGameOver(true)
          setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
        }
        return prevSnake
      }

      // Self collision - snake dies when hitting itself
      const hitSelf = prevSnake.some(segment => segment.x === head.x && segment.y === head.y)
      if (hitSelf) {
        if (!gameOverRef.current) {
          gameOverRef.current = true
          setGameOver(true)
          setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
        }
        return prevSnake
      }

      const newSnake = [head, ...prevSnake]
      let ate = false
      let ateBonus = false

      // Food collision
      if (head.x === food.x && head.y === food.y) {
        ate = true
        const now = Date.now()
        const comboBonus = now - lastEatTime < 3000 ? combo + 1 : 1
        setCombo(comboBonus)
        setLastEatTime(now)

        const points = food.points * (1 + (comboBonus - 1) * 0.1)
        const newScore = score + Math.floor(points)
        setScore(newScore)
        onScoreUpdate(newScore)
        setMoves(m => m + 1)
        setFlashEffect(true)
        setTimeout(() => setFlashEffect(false), 150)

        // Special food effects
        if (food.type === "speed") {
          setSpeedBoost(true)
          setSpeed(s => Math.max(60, s - 30))
          setTimeout(() => {
            setSpeedBoost(false)
            // Use refs for current values to avoid stale closures
            setSpeed(Math.max(80, baseSpeedRef.current - Math.floor(scoreRef.current / 100) * SPEED_INCREASE))
          }, 5000)
        } else if (food.type === "slow") {
          setSlowMode(true)
          setSpeed(s => s + 50)
          setTimeout(() => {
            setSlowMode(false)
            setSpeed(Math.max(80, baseSpeedRef.current - Math.floor(scoreRef.current / 100) * SPEED_INCREASE))
          }, 5000)
        }

        setFood(generateFood())
        spawnBonusFood()

        if (newScore % 100 === 0 && speed > 80) {
          setSpeed(s => Math.max(80, s - SPEED_INCREASE))
        }
      }

      // Bonus food collision
      if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
        ateBonus = true
        const newScore = score + bonusFood.points
        setScore(newScore)
        onScoreUpdate(newScore)
        setFlashEffect(true)
        setTimeout(() => setFlashEffect(false), 150)
        setBonusFood(null)
      }

      if (!ate && !ateBonus) {
        newSnake.pop()
      }

      return newSnake
    })
  }, [isActive, isPaused, gameOver, food, bonusFood, score, moves, combo, lastEatTime, speed, generateFood, spawnBonusFood, onGameEnd, onScoreUpdate])

  // Game loop using requestAnimationFrame for smooth animation
  useEffect(() => {
    if (!isActive || isPaused || gameOver) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    const gameLoop = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= speed) {
        moveSnake()
        lastUpdateRef.current = timestamp
      }
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [isActive, isPaused, gameOver, speed, moveSnake])

  // Bonus food expiration
  useEffect(() => {
    if (bonusFood?.expireAt) {
      const timeout = bonusFood.expireAt - Date.now()
      if (timeout <= 0) {
        setBonusFood(null)
      } else {
        const timer = setTimeout(() => setBonusFood(null), timeout)
        return () => clearTimeout(timer)
      }
    }
  }, [bonusFood])

  // Queue direction change
  const queueDirection = useCallback((newDir: Direction) => {
    const opposites: Record<Direction, Direction> = {
      UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT"
    }

    const lastDir = directionQueueRef.current.length > 0
      ? directionQueueRef.current[directionQueueRef.current.length - 1]
      : directionRef.current

    if (newDir !== opposites[lastDir] && newDir !== lastDir) {
      directionQueueRef.current.push(newDir)
      // Keep queue short
      if (directionQueueRef.current.length > 2) {
        directionQueueRef.current.shift()
      }
    }
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || gameOver) return

      const keyMap: Record<string, Direction> = {
        ArrowUp: "UP", w: "UP", W: "UP",
        ArrowDown: "DOWN", s: "DOWN", S: "DOWN",
        ArrowLeft: "LEFT", a: "LEFT", A: "LEFT",
        ArrowRight: "RIGHT", d: "RIGHT", D: "RIGHT",
      }

      if (keyMap[e.key]) {
        e.preventDefault()
        queueDirection(keyMap[e.key])
      } else if (e.key === "p" || e.key === "P" || e.key === " ") {
        e.preventDefault()
        setIsPaused(p => !p)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, gameOver, queueDirection])

  // Touch controls with better swipe detection
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastSwipeRef = useRef<number>(0)

  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    const handleTouchStart = (e: TouchEvent) => {
      if (!isActive || gameOver) return
      e.preventDefault()
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive || gameOver || !touchStartRef.current) return
      e.preventDefault()

      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const now = Date.now()

      // Throttle to prevent too many direction changes
      if (now - lastSwipeRef.current < 100) return

      const minSwipe = 30

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > minSwipe) {
          queueDirection("RIGHT")
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
          lastSwipeRef.current = now
        } else if (dx < -minSwipe) {
          queueDirection("LEFT")
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
          lastSwipeRef.current = now
        }
      } else {
        if (dy > minSwipe) {
          queueDirection("DOWN")
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
          lastSwipeRef.current = now
        } else if (dy < -minSwipe) {
          queueDirection("UP")
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
          lastSwipeRef.current = now
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isActive || gameOver || !touchStartRef.current) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const dt = Date.now() - touchStartRef.current.time
      const minSwipe = 25

      // Quick swipe at end
      if (dt < 300) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > minSwipe) queueDirection("RIGHT")
          else if (dx < -minSwipe) queueDirection("LEFT")
        } else {
          if (dy > minSwipe) queueDirection("DOWN")
          else if (dy < -minSwipe) queueDirection("UP")
        }
      }

      touchStartRef.current = null
    }

    board.addEventListener("touchstart", handleTouchStart, { passive: false })
    board.addEventListener("touchmove", handleTouchMove, { passive: false })
    board.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      board.removeEventListener("touchstart", handleTouchStart)
      board.removeEventListener("touchmove", handleTouchMove)
      board.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isActive, gameOver, queueDirection])

  const resetGame = () => {
    setHasWon(false)
    setSnake([{ x: 10, y: 10 }])
    setDirection("RIGHT")
    directionRef.current = "RIGHT"
    directionQueueRef.current = []
    setFood(generateFood())
    setBonusFood(null)
    setScore(initialScore)
    setMoves(0)
    setGameOver(false)
    setIsPaused(false)
    setSpeed(INITIAL_SPEED)
    setCombo(0)
    setSpeedBoost(false)
    setSlowMode(false)
    // Reset refs to prevent stale state issues
    gameOverRef.current = false
    scoreRef.current = 0
    movesRef.current = 0
  }

  const handleDirection = (dir: Direction) => {
    if (gameOver || isPaused) return
    queueDirection(dir)
  }

  const boardWidth = BOARD_SIZE * CELL_SIZE
  const boardHeight = BOARD_SIZE * CELL_SIZE

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Board */}
      <div
        ref={boardRef}
        className="relative rounded-lg p-2 border-2 border-gray-700 touch-none select-none overflow-hidden flex-shrink-0"
        style={{
          background: flashEffect ? "rgba(34, 197, 94, 0.2)" : "rgb(17, 24, 39)",
          transition: "background 100ms ease",
          width: boardWidth + 16,
          height: boardHeight + 16,
          maxWidth: "100%"
        }}
      >
        <svg
          width={boardWidth}
          height={boardHeight}
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          className="block"
          style={{ overflow: "hidden" }}
        >
          {/* Grid and clip path */}
          <defs>
            <pattern id="snakeGrid" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
              <rect width={CELL_SIZE} height={CELL_SIZE} fill="transparent" stroke="rgba(55,65,81,0.5)" strokeWidth="0.5" />
            </pattern>
            <clipPath id="boardClip">
              <rect x="0" y="0" width={boardWidth} height={boardHeight} />
            </clipPath>
          </defs>
          <rect width="100%" height="100%" fill="url(#snakeGrid)" />

          {/* Snake body - clipped to board boundaries */}
          <g clipPath="url(#boardClip)">
            {snake.map((segment, i) => {
              const isHead = i === 0
              const opacity = 1 - (i / snake.length) * 0.4
              // Clamp to board boundaries
              const x = Math.max(0, Math.min(segment.x, BOARD_SIZE - 1))
              const y = Math.max(0, Math.min(segment.y, BOARD_SIZE - 1))
              return (
                <rect
                  key={i}
                  x={x * CELL_SIZE + 1}
                  y={y * CELL_SIZE + 1}
                  width={CELL_SIZE - 2}
                  height={CELL_SIZE - 2}
                  rx={isHead ? 4 : 2}
                  fill={isHead ? "#34d399" : "#10b981"}
                  opacity={opacity}
                  style={{
                    filter: isHead ? "drop-shadow(0 0 4px rgba(52, 211, 153, 0.6))" : undefined
                  }}
                />
              )
            })}
          </g>

          {/* Food - clipped to board */}
          <g clipPath="url(#boardClip)">
            <circle
              cx={Math.min(Math.max(food.x, 0), BOARD_SIZE - 1) * CELL_SIZE + CELL_SIZE / 2}
              cy={Math.min(Math.max(food.y, 0), BOARD_SIZE - 1) * CELL_SIZE + CELL_SIZE / 2}
              r={CELL_SIZE / 2 - 2}
              fill={FOOD_TYPES[food.type].color}
              style={{
                filter: `drop-shadow(0 0 6px ${FOOD_TYPES[food.type].color})`
              }}
            >
              <animate attributeName="r" values={`${CELL_SIZE / 2 - 3};${CELL_SIZE / 2 - 1};${CELL_SIZE / 2 - 3}`} dur="0.8s" repeatCount="indefinite" />
            </circle>

            {/* Bonus food */}
            {bonusFood && (
              <circle
                cx={Math.min(Math.max(bonusFood.x, 0), BOARD_SIZE - 1) * CELL_SIZE + CELL_SIZE / 2}
                cy={Math.min(Math.max(bonusFood.y, 0), BOARD_SIZE - 1) * CELL_SIZE + CELL_SIZE / 2}
                r={CELL_SIZE / 2 - 1}
                fill="#ffd700"
                style={{
                  filter: "drop-shadow(0 0 8px #ffd700)"
                }}
              >
                <animate attributeName="opacity" values="1;0.6;1" dur="0.5s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        </svg>

        {/* Pause Overlay */}
        {isPaused && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Pause className="h-12 w-12 text-white mx-auto mb-2" />
              <p className="text-white font-bold">PAUSED</p>
              <p className="text-gray-400 text-sm">Tap to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className={`text-2xl font-bold mb-2 ${hasWon ? "text-green-500" : "text-red-500"}`}>
                {hasWon ? "YOU WIN!" : "GAME OVER"}
              </p>
              <p className="text-white mb-1">Score: {score.toLocaleString()}</p>
              <p className="text-gray-400 text-sm mb-4">Length: {snake.length}</p>
              <Button onClick={resetGame} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Play Again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      <div className="flex flex-col gap-3 min-w-[160px]">
        {/* Stats */}
        <Card className="p-4 bg-gray-900 border-gray-700">
          <div className="space-y-3">
            <div>
              <p className="text-gray-400 text-xs">Score</p>
              <p className="text-2xl font-bold text-white">{score.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Target</p>
              <p className="text-lg font-bold text-green-400">{winThreshold.toLocaleString()}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Length</p>
                <p className="font-bold text-lg text-emerald-400">{snake.length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Combo</p>
                <p className="font-bold text-lg text-amber-400">{combo}x</p>
              </div>
            </div>
            {(speedBoost || slowMode) && (
              <div className={`flex items-center gap-2 ${speedBoost ? "text-blue-400" : "text-purple-400"}`}>
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-bold">{speedBoost ? "Speed Boost!" : "Slow Mode!"}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-3 font-medium text-center">Controls</p>
          <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
            <div />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 active:scale-95"
              onClick={() => handleDirection("UP")}
              onTouchStart={(e) => { e.preventDefault(); handleDirection("UP") }}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 active:scale-95"
              onClick={() => handleDirection("LEFT")}
              onTouchStart={(e) => { e.preventDefault(); handleDirection("LEFT") }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 active:scale-95"
              onClick={() => setIsPaused(p => !p)}
              onTouchStart={(e) => { e.preventDefault(); setIsPaused(p => !p) }}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 active:scale-95"
              onClick={() => handleDirection("RIGHT")}
              onTouchStart={(e) => { e.preventDefault(); handleDirection("RIGHT") }}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 active:scale-95"
              onClick={() => handleDirection("DOWN")}
              onTouchStart={(e) => { e.preventDefault(); handleDirection("DOWN") }}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>
          <p className="text-gray-500 text-xs mt-2 text-center">Swipe on board to move</p>
        </Card>

        {/* Food Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Food Types</p>
          <div className="space-y-1.5 text-xs">
            {Object.entries(FOOD_TYPES).map(([type, config]) => (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-gray-300 capitalize">{type} +{config.points}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
