"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RotateCcw, Sparkles, Bird } from "lucide-react"

const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 400
const BIRD_SIZE = 24
const PIPE_WIDTH = 45
const PIPE_GAP = 130
const GRAVITY = 0.4
const JUMP_STRENGTH = -7
const PIPE_SPEED = 2.5

interface Pipe {
  x: number
  topHeight: number
  passed: boolean
  hasCoin: boolean
  coinCollected: boolean
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
}

export function FlappyGame({ onGameEnd, onScoreUpdate, isActive, difficulty: externalDifficulty, winThreshold = 15 }: FlappyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameLoopRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)

  const [hasWon, setHasWon] = useState(false)
  const [birdY, setBirdY] = useState(CANVAS_HEIGHT / 2)
  const [birdVelocity, setBirdVelocity] = useState(0)
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [score, setScore] = useState(0)
  const [coins, setCoins] = useState(0)
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
    }

    setBirdVelocity(JUMP_STRENGTH)
    setMoves(m => m + 1)
  }, [])

  const resetGame = useCallback(() => {
    setHasWon(false)
    setBirdY(CANVAS_HEIGHT / 2)
    setBirdVelocity(0)
    setPipes([])
    setScore(0)
    setCoins(0)
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

    const currentPipeSpeed = PIPE_SPEED + (difficultyRef.current - 1) * 0.3
    const currentPipeGap = Math.max(100, PIPE_GAP - difficultyRef.current * 3)

    const gameLoop = () => {
      if (gameOverRef.current) return

      frameCountRef.current++
      const frameCount = frameCountRef.current

      // Update physics
      const currentGravity = powerUpRef.current === "slow" ? GRAVITY * 0.6 : GRAVITY
      const newVelocity = velocityRef.current + currentGravity
      const newBirdY = Math.min(Math.max(birdYRef.current + newVelocity, 0), CANVAS_HEIGHT - BIRD_SIZE - 20)

      setBirdVelocity(newVelocity)
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

      // Spawn pipes
      const spawnRate = Math.max(80, 120 - difficultyRef.current * 8)
      if (frameCount % spawnRate === 0) {
        const minHeight = 50
        const maxHeight = CANVAS_HEIGHT - currentPipeGap - minHeight - 40
        const topHeight = Math.floor(Math.random() * (maxHeight - minHeight)) + minHeight
        const hasCoin = Math.random() < 0.4

        setPipes(prev => [...prev, {
          x: CANVAS_WIDTH,
          topHeight,
          passed: false,
          hasCoin,
          coinCollected: false
        }])
      }

      // Update pipes - separate collision detection from state updates to avoid race conditions
      const birdLeft = 50
      const birdRight = 50 + BIRD_SIZE
      const birdTop = newBirdY
      const birdBottom = newBirdY + BIRD_SIZE

      setPipes(prev => {
        let gameEnded = false
        let coinsToAdd = 0
        let scoreBonusFromCoins = 0
        let scoreBonusFromPassing = 0
        let newComboValue = comboRef.current

        const newPipes = prev.map(pipe => {
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

            // Check coin collision - 2 points per coin
            if (pipe.hasCoin && !pipe.coinCollected) {
              const coinY = pipe.topHeight + currentPipeGap / 2
              const coinX = newX + PIPE_WIDTH / 2
              const dist = Math.sqrt(Math.pow(birdLeft + BIRD_SIZE / 2 - coinX, 2) + Math.pow(birdTop + BIRD_SIZE / 2 - coinY, 2))
              if (dist < BIRD_SIZE) {
                updatedPipe.coinCollected = true
                coinsToAdd++
                scoreBonusFromCoins += 2
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
      // Background
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      gradient.addColorStop(0, "#87CEEB")
      gradient.addColorStop(1, "#98D8E8")
      ctx.fillStyle = gradient
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

        // Draw coin
        if (pipe.hasCoin && !pipe.coinCollected) {
          const coinY = pipe.topHeight + pipeGap / 2
          const coinX = pipe.x + PIPE_WIDTH / 2

          ctx.fillStyle = "#fbbf24"
          ctx.beginPath()
          ctx.arc(coinX, coinY, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = "#f59e0b"
          ctx.beginPath()
          ctx.arc(coinX, coinY, 6, 0, Math.PI * 2)
          ctx.fill()
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

      // Wing
      ctx.fillStyle = powerUpRef.current === "shield" ? "#3b82f6" : "#f59e0b"
      ctx.beginPath()
      ctx.ellipse(-2, 4, 8, 5, -0.3, 0, Math.PI * 2)
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
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-gray-300">Coin - +50 points</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
