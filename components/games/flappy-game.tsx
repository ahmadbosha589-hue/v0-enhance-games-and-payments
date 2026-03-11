"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RotateCcw, Sparkles, Bird } from "lucide-react"

const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 480
const BIRD_SIZE = 30
const PIPE_WIDTH = 50
const PIPE_GAP = 140
const GRAVITY = 0.5
const JUMP_STRENGTH = -8
const PIPE_SPEED = 3

interface Pipe {
  x: number
  topHeight: number
  passed: boolean
  hasCoin: boolean
  coinCollected: boolean
}

interface FlappyGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
}

export function FlappyGame({ onGameEnd, onScoreUpdate, isActive }: FlappyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  const [dayTime, setDayTime] = useState<"day" | "sunset" | "night">("day")
  const [difficulty, setDifficulty] = useState(1)
  const [powerUp, setPowerUp] = useState<"shield" | "slow" | null>(null)
  const [powerUpTimer, setPowerUpTimer] = useState(0)

  const gameLoopRef = useRef<number | null>(null)
  const birdYRef = useRef(birdY)
  const velocityRef = useRef(birdVelocity)
  const pipesRef = useRef(pipes)
  const scoreRef = useRef(score)
  const coinsRef = useRef(coins)
  const movesRef = useRef(moves)
  const powerUpRef = useRef(powerUp)

  // Keep refs in sync
  useEffect(() => {
    birdYRef.current = birdY
    velocityRef.current = birdVelocity
    pipesRef.current = pipes
    scoreRef.current = score
    coinsRef.current = coins
    movesRef.current = moves
    powerUpRef.current = powerUp
  }, [birdY, birdVelocity, pipes, score, coins, moves, powerUp])

  const jump = useCallback(() => {
    if (gameOver) return
    
    if (!gameStarted) {
      setGameStarted(true)
    }
    
    setBirdVelocity(JUMP_STRENGTH)
    setMoves(m => m + 1)
  }, [gameOver, gameStarted])

  const resetGame = useCallback(() => {
    setBirdY(CANVAS_HEIGHT / 2)
    setBirdVelocity(0)
    setPipes([])
    setScore(0)
    setCoins(0)
    setMoves(0)
    setGameOver(false)
    setGameStarted(false)
    setCombo(0)
    setDifficulty(1)
    setPowerUp(null)
    setPowerUpTimer(0)
  }, [])

  // Main game loop
  useEffect(() => {
    if (!isActive || !gameStarted || gameOver) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frameCount = 0
    const currentPipeSpeed = PIPE_SPEED + (difficulty - 1) * 0.5
    const currentGravity = powerUpRef.current === "slow" ? GRAVITY * 0.6 : GRAVITY

    const gameLoop = () => {
      frameCount++

      // Update bird position
      const newVelocity = velocityRef.current + currentGravity
      const newBirdY = Math.min(Math.max(birdYRef.current + newVelocity, 0), CANVAS_HEIGHT - BIRD_SIZE)
      
      setBirdVelocity(newVelocity)
      setBirdY(newBirdY)

      // Check ground/ceiling collision
      if (newBirdY >= CANVAS_HEIGHT - BIRD_SIZE || newBirdY <= 0) {
        if (powerUpRef.current !== "shield") {
          setGameOver(true)
          if (scoreRef.current > bestScore) setBestScore(scoreRef.current)
          onGameEnd(scoreRef.current, movesRef.current)
          return
        }
      }

      // Spawn pipes
      if (frameCount % Math.max(80, 120 - difficulty * 10) === 0) {
        const minHeight = 60
        const maxHeight = CANVAS_HEIGHT - PIPE_GAP - minHeight
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

      // Update pipes
      setPipes(prev => {
        const birdLeft = 50
        const birdRight = 50 + BIRD_SIZE
        const birdTop = newBirdY
        const birdBottom = newBirdY + BIRD_SIZE

        const updatedPipes = prev
          .map(pipe => {
            const newX = pipe.x - currentPipeSpeed
            
            // Check collision
            const pipeLeft = newX
            const pipeRight = newX + PIPE_WIDTH
            
            if (birdRight > pipeLeft && birdLeft < pipeRight) {
              // Check top pipe collision
              if (birdTop < pipe.topHeight) {
                if (powerUpRef.current !== "shield") {
                  setGameOver(true)
                  if (scoreRef.current > bestScore) setBestScore(scoreRef.current)
                  onGameEnd(scoreRef.current, movesRef.current)
                }
              }
              // Check bottom pipe collision
              if (birdBottom > pipe.topHeight + PIPE_GAP) {
                if (powerUpRef.current !== "shield") {
                  setGameOver(true)
                  if (scoreRef.current > bestScore) setBestScore(scoreRef.current)
                  onGameEnd(scoreRef.current, movesRef.current)
                }
              }
              
              // Check coin collision
              if (pipe.hasCoin && !pipe.coinCollected) {
                const coinY = pipe.topHeight + PIPE_GAP / 2
                const coinX = newX + PIPE_WIDTH / 2
                const dist = Math.sqrt(Math.pow(birdLeft + BIRD_SIZE/2 - coinX, 2) + Math.pow(birdTop + BIRD_SIZE/2 - coinY, 2))
                if (dist < BIRD_SIZE) {
                  pipe.coinCollected = true
                  setCoins(c => c + 1)
                  const newScore = scoreRef.current + 50
                  setScore(newScore)
                  onScoreUpdate(newScore)
                }
              }
            }

            // Check if passed
            if (!pipe.passed && newX + PIPE_WIDTH < 50) {
              pipe.passed = true
              const newCombo = combo + 1
              setCombo(newCombo)
              setShowCombo(true)
              setTimeout(() => setShowCombo(false), 500)
              
              const comboBonus = Math.min(newCombo * 5, 50)
              const newScore = scoreRef.current + 10 + comboBonus
              setScore(newScore)
              onScoreUpdate(newScore)
              
              // Increase difficulty
              if (scoreRef.current > 0 && scoreRef.current % 100 === 0) {
                setDifficulty(d => Math.min(d + 1, 5))
              }
            }

            return { ...pipe, x: newX }
          })
          .filter(pipe => pipe.x > -PIPE_WIDTH)

        return updatedPipes
      })

      // Change day time based on score
      if (scoreRef.current > 200 && dayTime === "day") {
        setDayTime("sunset")
      } else if (scoreRef.current > 500 && dayTime === "sunset") {
        setDayTime("night")
      }

      // Power-up timer
      if (powerUpTimer > 0) {
        setPowerUpTimer(t => t - 1)
        if (powerUpTimer <= 1) {
          setPowerUp(null)
        }
      }

      // Random power-up spawn
      if (frameCount % 500 === 0 && !powerUpRef.current && Math.random() < 0.3) {
        const type = Math.random() < 0.5 ? "shield" : "slow"
        setPowerUp(type)
        setPowerUpTimer(300)
      }

      // Draw everything
      drawGame(ctx)

      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    const drawGame = (ctx: CanvasRenderingContext2D) => {
      // Background based on time
      const bgColors = {
        day: ["#87CEEB", "#98D8E8"],
        sunset: ["#FF6B6B", "#FFE66D"],
        night: ["#1a1a2e", "#16213e"]
      }
      
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      gradient.addColorStop(0, bgColors[dayTime][0])
      gradient.addColorStop(1, bgColors[dayTime][1])
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw clouds
      ctx.fillStyle = dayTime === "night" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"
      for (let i = 0; i < 3; i++) {
        const x = ((frameCount * 0.5 + i * 150) % (CANVAS_WIDTH + 100)) - 50
        ctx.beginPath()
        ctx.arc(x, 60 + i * 40, 30, 0, Math.PI * 2)
        ctx.arc(x + 25, 60 + i * 40, 25, 0, Math.PI * 2)
        ctx.arc(x + 50, 60 + i * 40, 30, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw pipes
      pipesRef.current.forEach(pipe => {
        // Pipe gradient
        const pipeGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0)
        pipeGradient.addColorStop(0, "#2d8b3b")
        pipeGradient.addColorStop(0.5, "#4ade80")
        pipeGradient.addColorStop(1, "#2d8b3b")
        
        ctx.fillStyle = pipeGradient
        
        // Top pipe
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight)
        ctx.fillRect(pipe.x - 5, pipe.topHeight - 20, PIPE_WIDTH + 10, 20)
        
        // Bottom pipe
        const bottomY = pipe.topHeight + PIPE_GAP
        ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY)
        ctx.fillRect(pipe.x - 5, bottomY, PIPE_WIDTH + 10, 20)

        // Draw coin
        if (pipe.hasCoin && !pipe.coinCollected) {
          const coinY = pipe.topHeight + PIPE_GAP / 2
          const coinX = pipe.x + PIPE_WIDTH / 2
          
          ctx.fillStyle = "#fbbf24"
          ctx.beginPath()
          ctx.arc(coinX, coinY, 12, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = "#f59e0b"
          ctx.beginPath()
          ctx.arc(coinX, coinY, 8, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Draw bird
      const birdX = 50
      const birdAngle = Math.min(Math.max(velocityRef.current * 3, -30), 90) * Math.PI / 180
      
      ctx.save()
      ctx.translate(birdX + BIRD_SIZE/2, birdYRef.current + BIRD_SIZE/2)
      ctx.rotate(birdAngle)
      
      // Bird body
      ctx.fillStyle = powerUpRef.current === "shield" ? "#60a5fa" : "#fbbf24"
      ctx.beginPath()
      ctx.ellipse(0, 0, BIRD_SIZE/2, BIRD_SIZE/2.5, 0, 0, Math.PI * 2)
      ctx.fill()
      
      // Wing
      ctx.fillStyle = powerUpRef.current === "shield" ? "#3b82f6" : "#f59e0b"
      ctx.beginPath()
      ctx.ellipse(-2, 5, 10, 6, -0.3, 0, Math.PI * 2)
      ctx.fill()
      
      // Eye
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(8, -3, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#000"
      ctx.beginPath()
      ctx.arc(10, -3, 3, 0, Math.PI * 2)
      ctx.fill()
      
      // Beak
      ctx.fillStyle = "#ef4444"
      ctx.beginPath()
      ctx.moveTo(15, 0)
      ctx.lineTo(22, 3)
      ctx.lineTo(15, 6)
      ctx.closePath()
      ctx.fill()

      // Shield effect
      if (powerUpRef.current === "shield") {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.6)"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, BIRD_SIZE * 0.8, 0, Math.PI * 2)
        ctx.stroke()
      }
      
      ctx.restore()

      // Draw ground
      ctx.fillStyle = dayTime === "night" ? "#2d3748" : "#8B4513"
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20)
      ctx.fillStyle = dayTime === "night" ? "#4a5568" : "#228B22"
      ctx.fillRect(0, CANVAS_HEIGHT - 25, CANVAS_WIDTH, 8)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current)
    }
  }, [isActive, gameStarted, gameOver, dayTime, combo, powerUp, powerUpTimer, bestScore, difficulty, onGameEnd, onScoreUpdate])

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
    ctx.arc(50 + BIRD_SIZE/2, CANVAS_HEIGHT/2 + BIRD_SIZE/2, BIRD_SIZE/2, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  // Keyboard/touch controls
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

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Game Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={jump}
          className="rounded-lg border-2 border-gray-700 cursor-pointer"
        />

        {/* Start Overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Bird className="h-16 w-16 text-yellow-400 mx-auto mb-4 animate-bounce" />
              <p className="text-white font-bold text-xl mb-2">Flappy Bird</p>
              <p className="text-gray-300 text-sm">Click or press Space to start!</p>
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
              <p className="text-2xl font-bold text-red-500 mb-2">GAME OVER</p>
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
            <div>
              <p className="text-gray-400 text-xs">Difficulty</p>
              <div className="flex gap-1 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div 
                    key={i}
                    className={`w-4 h-2 rounded ${i < difficulty ? "bg-red-500" : "bg-gray-700"}`}
                  />
                ))}
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
