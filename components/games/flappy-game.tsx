"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RotateCcw, Sparkles, Bird } from "lucide-react"

const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 400
const BIRD_SIZE = 24
const PIPE_WIDTH = 45
const PIPE_GAP = 135 // Balanced gap
const GRAVITY = 0.35 // Smooth gravity - feels natural
const JUMP_STRENGTH = -6.5 // Responsive jump
const PIPE_SPEED = 2.2 // Good pace
const MAX_VELOCITY = 8 // Natural falling speed
const TARGET_FPS = 60
const FRAME_TIME = 1000 / TARGET_FPS
const PHYSICS_STEP = 1 / 60 // Fixed physics timestep for consistent behavior

// Coin types with different point values
const COIN_TYPES = {
  bronze: { color: "#cd7f32", innerColor: "#a0522d", points: 2 },
  silver: { color: "#c0c0c0", innerColor: "#a8a8a8", points: 3 },
  gold: { color: "#ffd700", innerColor: "#daa520", points: 4 }
}

interface Pipe {
  x: number
  topHeight: number
  passed: boolean
  hasCoin: boolean
  coinCollected: boolean
  coinType: keyof typeof COIN_TYPES
}

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface FlappyGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number
  initialScore?: number
}

export function FlappyGame({ onGameEnd, onScoreUpdate, isActive, difficulty: externalDifficulty, winThreshold = 15, initialScore = 0 }: FlappyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameLoopRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const accumulatedTimeRef = useRef(0)

  const [hasWon, setHasWon] = useState(false)
  const [birdY, setBirdY] = useState(CANVAS_HEIGHT / 2)
  const [birdVelocity, setBirdVelocity] = useState(0)
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [score, setScore] = useState(0)
  const [coins, setCoins] = useState(0)
  const [coinsByType, setCoinsByType] = useState({ bronze: 0, silver: 0, gold: 0 })
  const [moves, setMoves] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [bestScore, setBestScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [showCombo, setShowCombo] = useState(false)
  const [difficulty, setDifficulty] = useState(externalDifficulty?.level || 1)
  const [powerUp, setPowerUp] = useState<"shield" | "slow" | null>(null)
  const [powerUpTimer, setPowerUpTimer] = useState(0)

  // Refs for game state in animation loop
  const birdYRef = useRef(birdY)
  const velocityRef = useRef(birdVelocity)
  const pipesRef = useRef(pipes)
  const scoreRef = useRef(score)
  const coinsRef = useRef(coins)
  const coinsByTypeRef = useRef(coinsByType)
  const movesRef = useRef(moves)
  const powerUpRef = useRef(powerUp)
  const gameOverRef = useRef(gameOver)
  const gameStartedRef = useRef(gameStarted)
  const hasEndedRef = useRef(false) // Prevent multiple onGameEnd calls
  const comboRef = useRef(combo)
  const difficultyRef = useRef(difficulty)
  const powerUpTimerRef = useRef(powerUpTimer)

  // Keep refs in sync
  useEffect(() => {
    birdYRef.current = birdY
    velocityRef.current = birdVelocity
    pipesRef.current = pipes
    scoreRef.current = score
    coinsRef.current = coins
    coinsByTypeRef.current = coinsByType
    movesRef.current = moves
    powerUpRef.current = powerUp
    gameOverRef.current = gameOver
    gameStartedRef.current = gameStarted
    comboRef.current = combo
    difficultyRef.current = difficulty
    powerUpTimerRef.current = powerUpTimer
  }, [birdY, birdVelocity, pipes, score, coins, moves, powerUp, gameOver, gameStarted, combo, difficulty, powerUpTimer])

  // Auto-win detection
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && gameStarted) {
      setHasWon(true)
      setGameOver(true)
      onGameEnd(score, moves)
    }
  }, [score, winThreshold, hasWon, gameOver, gameStarted, moves, onGameEnd])

  const jump = useCallback(() => {
    if (gameOverRef.current) return

    if (!gameStartedRef.current) {
      setGameStarted(true)
      // Reset timing on game start for clean physics
      lastFrameTimeRef.current = 0
      accumulatedTimeRef.current = 0
    }

    // Immediate responsive jump - directly set velocity for crisp control
    velocityRef.current = JUMP_STRENGTH
    setBirdVelocity(JUMP_STRENGTH)
    setMoves(m => m + 1)
  }, [])

  const resetGame = useCallback(() => {
    setHasWon(false)
    setBirdY(CANVAS_HEIGHT / 2)
    setBirdVelocity(0)
    setPipes([])
    setScore(initialScore)
    setCoins(0)
    setCoinsByType({ bronze: 0, silver: 0, gold: 0 })
    setMoves(0)
    setGameOver(false)
    setGameStarted(false)
    setCombo(0)
    setDifficulty(externalDifficulty?.level || 1)
    setPowerUp(null)
    setPowerUpTimer(0)
    frameCountRef.current = 0
    hasEndedRef.current = false
  }, [externalDifficulty?.level])

  // Draw initial state
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Draw sky
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    gradient.addColorStop(0, "#87CEEB")
    gradient.addColorStop(1, "#98D8E8")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw ground
    ctx.fillStyle = "#8B4513"
    ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20)
    ctx.fillStyle = "#228B22"
    ctx.fillRect(0, CANVAS_HEIGHT - 25, CANVAS_WIDTH, 8)

    // Draw bird
    ctx.fillStyle = "#fbbf24"
    ctx.beginPath()
    ctx.arc(50 + BIRD_SIZE / 2, CANVAS_HEIGHT / 2 + BIRD_SIZE / 2, BIRD_SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  // Main game loop
  useEffect(() => {
    if (!isActive || !gameStarted || gameOver) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const currentPipeSpeed = PIPE_SPEED + (difficultyRef.current - 1) * 0.25
    const currentPipeGap = Math.max(110, PIPE_GAP - difficultyRef.current * 2)

    // Pre-create cached gradients for performance
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    bgGradient.addColorStop(0, "#87CEEB")
    bgGradient.addColorStop(1, "#98D8E8")

    const gameLoop = (timestamp: number) => {
      if (gameOverRef.current) return

      // Initialize timing on first frame
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp
        accumulatedTimeRef.current = 0
      }

      // Calculate delta time and cap it to prevent spiral of death
      const rawDelta = timestamp - lastFrameTimeRef.current
      const deltaTime = Math.min(rawDelta, 50) // Cap at 50ms (20fps min) to prevent huge jumps
      lastFrameTimeRef.current = timestamp
      accumulatedTimeRef.current += deltaTime

      // Fixed timestep physics update for consistent behavior
      let physicsUpdates = 0
      const maxUpdates = 4 // Prevent too many updates on lag

      while (accumulatedTimeRef.current >= FRAME_TIME && physicsUpdates < maxUpdates) {
        accumulatedTimeRef.current -= FRAME_TIME
        frameCountRef.current++
        physicsUpdates++
      }

      // Clear excess accumulated time to prevent spiral of death
      if (accumulatedTimeRef.current > FRAME_TIME * 2) {
        accumulatedTimeRef.current = 0
      }

      const frameCount = frameCountRef.current

      // Smooth physics with interpolation factor
      const alpha = Math.min(accumulatedTimeRef.current / FRAME_TIME, 1)

      // Apply gravity with fixed timestep for consistency
      const currentGravity = powerUpRef.current === "slow" ? GRAVITY * 0.5 : GRAVITY
      const newVelocity = Math.min(velocityRef.current + currentGravity, MAX_VELOCITY)

      // Interpolated position for smooth rendering
      const basePosition = birdYRef.current + newVelocity
      const newBirdY = Math.min(Math.max(basePosition, 0), CANVAS_HEIGHT - BIRD_SIZE - 20)

      setBirdVelocity(newVelocity)
      velocityRef.current = newVelocity // Update ref immediately
      setBirdY(newBirdY)

      // Check ground/ceiling collision
      if (newBirdY >= CANVAS_HEIGHT - BIRD_SIZE - 20 || newBirdY <= 0) {
        if (powerUpRef.current !== "shield" && !hasEndedRef.current) {
          hasEndedRef.current = true
          setGameOver(true)
          if (scoreRef.current > bestScore) setBestScore(scoreRef.current)
          setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
          return
        }
      }

      // Spawn pipes - ensure only ONE pipe spawns at a time
      // Check minimum distance from the last pipe to prevent multiple pipes spawning together
      const MIN_PIPE_DISTANCE = 150 // Minimum pixels between pipes
      const lastPipe = pipesRef.current[pipesRef.current.length - 1]
      const canSpawnPipe = !lastPipe || lastPipe.x < CANVAS_WIDTH - MIN_PIPE_DISTANCE

      const spawnRate = Math.max(80, 120 - difficultyRef.current * 8)
      if (frameCount % spawnRate === 0 && canSpawnPipe) {
        // Ensure proper pipe height calculations:
        // - Ground is at CANVAS_HEIGHT - 20 (380)
        // - Need space for gap (currentPipeGap ~110-135)
        // - Need minimum pipe height visible (50 for top, 50 for bottom)
        const groundY = CANVAS_HEIGHT - 20 // 380
        const minTopPipeHeight = 40 // Minimum visible top pipe
        const minBottomPipeHeight = 40 // Minimum visible bottom pipe
        const maxTopPipeHeight = groundY - currentPipeGap - minBottomPipeHeight // Max top height leaving room for gap + bottom pipe

        // Clamp to valid range
        const safeMinHeight = Math.max(minTopPipeHeight, 40)
        const safeMaxHeight = Math.min(maxTopPipeHeight, groundY - currentPipeGap - 40)

        // Generate random height within safe bounds
        const topHeight = safeMinHeight + Math.floor(Math.random() * Math.max(1, safeMaxHeight - safeMinHeight))

        const hasCoin = Math.random() < 0.4

        // Random coin type with weighted distribution: 50% bronze, 30% silver, 20% gold
        const coinRoll = Math.random()
        const coinType: keyof typeof COIN_TYPES = coinRoll < 0.5 ? "bronze" : coinRoll < 0.8 ? "silver" : "gold"

        setPipes(prev => [...prev, {
          x: CANVAS_WIDTH,
          topHeight,
          passed: false,
          hasCoin,
          coinCollected: false,
          coinType
        }])
      }

      // Update pipes with smooth movement
      const birdLeft = 50
      const birdRight = 50 + BIRD_SIZE
      const birdTop = newBirdY
      const birdBottom = newBirdY + BIRD_SIZE
      const birdCenterX = 50 + BIRD_SIZE / 2
      const birdCenterY = newBirdY + BIRD_SIZE / 2

      setPipes(prev => {
        let gameEnded = false
        let coinsToAdd = 0
        let scoreBonusFromCoins = 0
        let scoreBonusFromPassing = 0
        let newComboValue = comboRef.current

        const newPipes = prev.map(pipe => {
          // Smooth pipe movement - consistent speed regardless of frame rate
          const newX = pipe.x - currentPipeSpeed
          const updatedPipe = { ...pipe, x: newX }

          // Check collision
          const pipeLeft = newX
          const pipeRight = newX + PIPE_WIDTH

          if (birdRight > pipeLeft && birdLeft < pipeRight) {
            // Check top pipe collision
            if (birdTop < pipe.topHeight) {
              if (powerUpRef.current !== "shield" && !gameEnded) {
                gameEnded = true
              }
            }
            // Check bottom pipe collision
            if (birdBottom > pipe.topHeight + currentPipeGap) {
              if (powerUpRef.current !== "shield" && !gameEnded) {
                gameEnded = true
              }
            }

            // Check coin collision - points based on coin type (bronze=2, silver=3, gold=4)
            if (pipe.hasCoin && !pipe.coinCollected) {
              const coinY = pipe.topHeight + currentPipeGap / 2
              const coinX = newX + PIPE_WIDTH / 2
              const dist = Math.sqrt(Math.pow(birdCenterX - coinX, 2) + Math.pow(birdCenterY - coinY, 2))
              if (dist < BIRD_SIZE * 0.9) { // Slightly more forgiving coin collection
                updatedPipe.coinCollected = true
                coinsToAdd++
                const coinPoints = COIN_TYPES[pipe.coinType || "bronze"].points
                scoreBonusFromCoins += coinPoints
                // Track coins by type
                setCoinsByType(prev => ({
                  ...prev,
                  [pipe.coinType || "bronze"]: prev[pipe.coinType || "bronze"] + 1
                }))
              }
            }
          }

          // Check if passed - 1 point for passing a pipe
          if (!pipe.passed && newX + PIPE_WIDTH < 50) {
            updatedPipe.passed = true
            newComboValue++
            scoreBonusFromPassing += 1
          }

          return updatedPipe
        })

        // Apply state updates after the map
        if (gameEnded && !gameOverRef.current && !hasEndedRef.current) {
          hasEndedRef.current = true
          setGameOver(true)
          if (scoreRef.current > bestScore) setBestScore(scoreRef.current)
          setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
        }

        if (coinsToAdd > 0) {
          setCoins(c => c + coinsToAdd)
        }

        if (scoreBonusFromCoins > 0 || scoreBonusFromPassing > 0) {
          const totalBonus = scoreBonusFromCoins + scoreBonusFromPassing
          const newScore = scoreRef.current + totalBonus
          setScore(newScore)
          onScoreUpdate(newScore)

          if (scoreBonusFromPassing > 0) {
            setCombo(newComboValue)
            if (newComboValue > 1) {
              setShowCombo(true)
              setTimeout(() => setShowCombo(false), 500)
            }

            // Increase difficulty every 10 pipes
            if (newComboValue > 0 && newComboValue % 10 === 0) {
              setDifficulty(d => Math.min(d + 1, 5))
            }
          }
        }

        return newPipes.filter(pipe => pipe.x > -PIPE_WIDTH)
      })

      // Power-up timer
      if (powerUpTimerRef.current > 0) {
        setPowerUpTimer(t => {
          const newTimer = t - 1
          if (newTimer <= 0) {
            setPowerUp(null)
          }
          return Math.max(0, newTimer)
        })
      }

      // Random power-up spawn
      if (frameCount % 500 === 0 && !powerUpRef.current && Math.random() < 0.3) {
        const type = Math.random() < 0.5 ? "shield" : "slow"
        setPowerUp(type)
        setPowerUpTimer(180)
      }

      // Draw everything
      drawGame(ctx, newBirdY, newVelocity, pipesRef.current, currentPipeGap, frameCount)

      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    const drawGame = (ctx: CanvasRenderingContext2D, birdYPos: number, velocity: number, currentPipes: Pipe[], pipeGap: number, frameCount: number) => {
      // Background - use cached gradient for performance
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw clouds
      ctx.fillStyle = "rgba(255,255,255,0.8)"
      for (let i = 0; i < 3; i++) {
        const x = ((frameCount * 0.3 + i * 120) % (CANVAS_WIDTH + 80)) - 40
        ctx.beginPath()
        ctx.arc(x, 50 + i * 35, 25, 0, Math.PI * 2)
        ctx.arc(x + 20, 50 + i * 35, 20, 0, Math.PI * 2)
        ctx.arc(x + 40, 50 + i * 35, 25, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw pipes
      currentPipes.forEach(pipe => {
        // Pipe gradient
        const pipeGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0)
        pipeGradient.addColorStop(0, "#2d8b3b")
        pipeGradient.addColorStop(0.5, "#4ade80")
        pipeGradient.addColorStop(1, "#2d8b3b")

        ctx.fillStyle = pipeGradient

        // Top pipe
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight)
        ctx.fillRect(pipe.x - 4, pipe.topHeight - 18, PIPE_WIDTH + 8, 18)

        // Bottom pipe
        const bottomY = pipe.topHeight + pipeGap
        ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY - 20)
        ctx.fillRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 18)

        // Draw coin with type-based colors
        if (pipe.hasCoin && !pipe.coinCollected) {
          const coinY = pipe.topHeight + pipeGap / 2
          const coinX = pipe.x + PIPE_WIDTH / 2
          const coinConfig = COIN_TYPES[pipe.coinType || "bronze"]

          ctx.fillStyle = coinConfig.color
          ctx.beginPath()
          ctx.arc(coinX, coinY, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = coinConfig.innerColor
          ctx.beginPath()
          ctx.arc(coinX, coinY, 6, 0, Math.PI * 2)
          ctx.fill()

          // Show point value on coin
          ctx.fillStyle = "#fff"
          ctx.font = "bold 8px sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(coinConfig.points.toString(), coinX, coinY)
        }
      })

      // Draw bird
      const birdX = 50
      const birdAngle = Math.min(Math.max(velocity * 3, -30), 90) * Math.PI / 180

      ctx.save()
      ctx.translate(birdX + BIRD_SIZE / 2, birdYPos + BIRD_SIZE / 2)
      ctx.rotate(birdAngle)

      // Bird body
      ctx.fillStyle = powerUpRef.current === "shield" ? "#60a5fa" : "#fbbf24"
      ctx.beginPath()
      ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2.5, 0, 0, Math.PI * 2)
      ctx.fill()

      // Wing with flap animation - faster when going up
      const wingFlap = Math.sin(frameCount * (velocity < 0 ? 0.5 : 0.15)) * 3
      ctx.fillStyle = powerUpRef.current === "shield" ? "#3b82f6" : "#f59e0b"
      ctx.beginPath()
      ctx.ellipse(-2, 4 + wingFlap, 8, 5, -0.3 + wingFlap * 0.05, 0, Math.PI * 2)
      ctx.fill()

      // Eye
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(6, -2, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#000"
      ctx.beginPath()
      ctx.arc(7, -2, 2.5, 0, Math.PI * 2)
      ctx.fill()

      // Beak
      ctx.fillStyle = "#ef4444"
      ctx.beginPath()
      ctx.moveTo(12, 0)
      ctx.lineTo(18, 3)
      ctx.lineTo(12, 6)
      ctx.closePath()
      ctx.fill()

      // Shield effect
      if (powerUpRef.current === "shield") {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.6)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, BIRD_SIZE * 0.7, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.restore()

      // Draw ground
      ctx.fillStyle = "#8B4513"
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20)
      ctx.fillStyle = "#228B22"
      ctx.fillRect(0, CANVAS_HEIGHT - 25, CANVAS_WIDTH, 8)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current)
    }
  }, [isActive, gameStarted, gameOver, bestScore, onGameEnd, onScoreUpdate])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault()
        jump()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [jump])

  // Handle interaction
  const handleInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    jump()
  }, [jump])

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Canvas */}
      <div
        ref={containerRef}
        className="relative touch-none select-none flex-shrink-0 rounded-lg border-2 border-gray-700 overflow-hidden"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, maxWidth: "100%" }}
        onClick={handleInteraction}
        onTouchStart={handleInteraction}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block"
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        />

        {/* Start Overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Bird className="h-14 w-14 text-yellow-400 mx-auto mb-4 animate-bounce" />
              <p className="text-white font-bold text-xl mb-2">Flappy Bird</p>
              <p className="text-gray-300 text-sm">Tap or press Space to start!</p>
            </div>
          </div>
        )}

        {/* Combo Display */}
        {showCombo && combo > 1 && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 animate-bounce">
            <span className="text-2xl font-bold text-yellow-400 drop-shadow-lg">
              {combo}x Combo!
            </span>
          </div>
        )}

        {/* Power-up Indicator */}
        {powerUp && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500/80 px-3 py-1 rounded-full">
            <span className="text-white text-sm font-bold">
              {powerUp === "shield" ? "Shield Active!" : "Slow Motion!"}
            </span>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className={`text-2xl font-bold mb-2 ${hasWon ? "text-green-500" : "text-red-500"}`}>
                {hasWon ? "YOU WIN!" : "GAME OVER"}
              </p>
              <p className="text-white mb-1">Score: {score}</p>
              <p className="text-gray-400 text-sm mb-1">Coins: {coins}</p>
              <p className="text-yellow-400 text-sm mb-4">Best: {bestScore}</p>
              <Button onClick={resetGame} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
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
              <p className="text-2xl font-bold text-white">{score}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Target</p>
              <p className="text-lg font-bold text-green-400">{winThreshold}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Coins</p>
                <p className="font-bold text-lg text-yellow-400">{coins}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Best</p>
                <p className="font-bold text-lg text-green-400">{bestScore}</p>
              </div>
            </div>

            {combo > 1 && (
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="h-4 w-4" />
                <span className="font-bold">{combo}x Combo!</span>
              </div>
            )}
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Controls</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Click / Tap to flap</li>
            <li>Space / Up Arrow</li>
            <li>Avoid the pipes!</li>
            <li>Reach {winThreshold} to win!</li>
          </ul>
        </Card>

        {/* Coin Types */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Coin Points</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#cd7f32" }} />
                <span className="text-gray-300">Bronze</span>
              </div>
              <span className="text-gray-400">2 pts ({coinsByType.bronze})</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#c0c0c0" }} />
                <span className="text-gray-300">Silver</span>
              </div>
              <span className="text-gray-400">3 pts ({coinsByType.silver})</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ffd700" }} />
                <span className="text-gray-300">Gold</span>
              </div>
              <span className="text-gray-400">4 pts ({coinsByType.gold})</span>
            </div>
          </div>
        </Card>

        {/* Power-ups Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Power-ups</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-300">Shield - Invincible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-gray-300">Slow - Less gravity</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
