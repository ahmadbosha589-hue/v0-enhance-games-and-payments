"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Play, Pause, ArrowLeft, ArrowRight, Fuel, Trophy, RotateCcw } from "lucide-react"

const CANVAS_WIDTH = 300
const CANVAS_HEIGHT = 420
const CAR_WIDTH = 40
const CAR_HEIGHT = 60
const OBSTACLE_WIDTH = 40
const OBSTACLE_HEIGHT = 60
const LANE_COUNT = 3
const LANE_WIDTH = CANVAS_WIDTH / LANE_COUNT

// Weather types for visual variety
const WEATHER_TYPES = ["clear", "rain", "night", "sunset"] as const
type WeatherType = typeof WEATHER_TYPES[number]

// Power-up types
const POWER_UPS = {
  shield: { duration: 5000, color: "#3b82f6" },
  magnet: { duration: 8000, color: "#a855f7" },
  slowmo: { duration: 4000, color: "#22c55e" },
  doubleCoins: { duration: 10000, color: "#fbbf24" },
}

type PowerUpType = keyof typeof POWER_UPS | null

interface Obstacle {
  x: number
  y: number
  type: "car" | "truck" | "cone" | "bike"
  lane: number
  color: string
  speed?: number
}

interface Coin {
  x: number
  y: number
  collected: boolean
  value: number
}

interface PowerUp {
  x: number
  y: number
  type: keyof typeof POWER_UPS
  collected: boolean
}

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface CarRacingGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number // Score needed to win and get reward
}

export function CarRacingGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 300 }: CarRacingGameProps) {
  // Apply difficulty settings
  const speedMultiplier = difficulty?.speedMultiplier || 1
  const obstacleFrequency = difficulty?.obstacleFrequency || 1
  const bonusChance = difficulty?.bonusChance || 0.15
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasWon, setHasWon] = useState(false)
  const gameLoopRef = useRef<number | null>(null)
  const [score, setScore] = useState(0)
  const [distance, setDistance] = useState(0)
  const [speed, setSpeed] = useState(5)
  const [lives, setLives] = useState(3)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [moves, setMoves] = useState(0)
  const [lane, setLane] = useState(1) // 0, 1, or 2
  const [playerY, setPlayerY] = useState(CANVAS_HEIGHT - CAR_HEIGHT - 20)
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [coins, setCoins] = useState<Coin[]>([])
  const [isInvincible, setIsInvincible] = useState(false)
  const [roadOffset, setRoadOffset] = useState(0)
  const [weather, setWeather] = useState<WeatherType>(() => WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)])
  const [powerUps, setPowerUps] = useState<PowerUp[]>([])
  const [activePowerUp, setActivePowerUp] = useState<PowerUpType>(null)
  const [coinMultiplier, setCoinMultiplier] = useState(1)
  const [hasMagnet, setHasMagnet] = useState(false)
  const [nearMissBonus, setNearMissBonus] = useState<{ show: boolean; points: number }>({ show: false, points: 0 })
  const [milestone, setMilestone] = useState<number | null>(null)
  const lastNearMissRef = useRef<number>(0)
  const hasEndedRef = useRef(false)

  const playerX = (lane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2

  const obstacleColors = ["#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#9333ea"]

  // Auto-win detection - when score reaches threshold, trigger win
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive && !hasEndedRef.current) {
      hasEndedRef.current = true
      setHasWon(true)
      setGameOver(true)
      setTimeout(() => onGameEnd(score, moves), 0)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, moves, onGameEnd])

  const spawnObstacle = useCallback(() => {
    const newLane = Math.floor(Math.random() * LANE_COUNT)
    const roll = Math.random()
    const type = roll > 0.4 ? "car" : roll > 0.2 ? "truck" : roll > 0.1 ? "bike" : "cone"
    const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)]
    // Random speed variation for obstacles
    const speedVariation = 0.5 + Math.random() * 1.5

    const newObstacle: Obstacle = {
      x: (newLane * LANE_WIDTH) + (LANE_WIDTH - OBSTACLE_WIDTH) / 2,
      y: -OBSTACLE_HEIGHT,
      type,
      lane: newLane,
      color,
      speed: speedVariation
    }

    setObstacles(prev => [...prev, newObstacle])
  }, [])

  const spawnCoin = useCallback(() => {
    const coinLane = Math.floor(Math.random() * LANE_COUNT)
    // Random coin values for excitement
    const coinValues = [10, 10, 10, 25, 25, 50, 100]
    const value = coinValues[Math.floor(Math.random() * coinValues.length)]
    const newCoin: Coin = {
      x: (coinLane * LANE_WIDTH) + (LANE_WIDTH - 20) / 2,
      y: -20,
      collected: false,
      value
    }
    setCoins(prev => [...prev, newCoin])
  }, [])

  const spawnPowerUp = useCallback(() => {
    const powerUpLane = Math.floor(Math.random() * LANE_COUNT)
    const types = Object.keys(POWER_UPS) as (keyof typeof POWER_UPS)[]
    const type = types[Math.floor(Math.random() * types.length)]
    const newPowerUp: PowerUp = {
      x: (powerUpLane * LANE_WIDTH) + (LANE_WIDTH - 24) / 2,
      y: -24,
      type,
      collected: false
    }
    setPowerUps(prev => [...prev, newPowerUp])
  }, [])

  const activatePowerUp = useCallback((type: keyof typeof POWER_UPS) => {
    setActivePowerUp(type)

    if (type === "shield") {
      setIsInvincible(true)
    } else if (type === "magnet") {
      setHasMagnet(true)
    } else if (type === "slowmo") {
      setSpeed(s => Math.max(3, s * 0.5))
    } else if (type === "doubleCoins") {
      setCoinMultiplier(2)
    }

    setTimeout(() => {
      setActivePowerUp(null)
      if (type === "shield") setIsInvincible(false)
      if (type === "magnet") setHasMagnet(false)
      if (type === "slowmo") setSpeed(s => Math.min(15, s * 2))
      if (type === "doubleCoins") setCoinMultiplier(1)
    }, POWER_UPS[type].duration)
  }, [])

  const resetGame = useCallback(() => {
    setScore(0)
    setDistance(0)
    setSpeed(5)
    setLives(3)
    setGameOver(false)
    setIsPaused(false)
    setMoves(0)
    setLane(1)
    setObstacles([])
    setCoins([])
    setIsInvincible(false)
    setRoadOffset(0)
    setWeather(WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)])
    setPowerUps([])
    setActivePowerUp(null)
    setCoinMultiplier(1)
    setHasMagnet(false)
    setNearMissBonus({ show: false, points: 0 })
    setMilestone(null)
    setHasWon(false)
    hasEndedRef.current = false
  }, [])

  const moveLeft = useCallback(() => {
    if (isPaused || gameOver) return
    setLane(l => Math.max(0, l - 1))
    setMoves(m => m + 1)
  }, [isPaused, gameOver])

  const moveRight = useCallback(() => {
    if (isPaused || gameOver) return
    setLane(l => Math.min(LANE_COUNT - 1, l + 1))
    setMoves(m => m + 1)
  }, [isPaused, gameOver])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || gameOver) return

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault()
          moveLeft()
          break
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault()
          moveRight()
          break
        case "p":
        case "P":
        case " ":
          e.preventDefault()
          setIsPaused(p => !p)
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, gameOver, moveLeft, moveRight])

  // Touch/swipe controls for mobile
  const touchStartRef = useRef<{ x: number; time: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleTouchStart = (e: TouchEvent) => {
      if (!isActive || gameOver || isPaused) return
      e.preventDefault()
      touchStartRef.current = {
        x: e.touches[0].clientX,
        time: Date.now()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive || gameOver || isPaused || !touchStartRef.current) return
      e.preventDefault()

      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const swipeThreshold = 40

      // Continuous swipe detection
      if (dx > swipeThreshold) {
        moveRight()
        touchStartRef.current = { x: touch.clientX, time: Date.now() }
      } else if (dx < -swipeThreshold) {
        moveLeft()
        touchStartRef.current = { x: touch.clientX, time: Date.now() }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dt = Date.now() - touchStartRef.current.time

      // Quick swipe at end
      if (dt < 200) {
        if (dx > 30) moveRight()
        else if (dx < -30) moveLeft()
      }

      touchStartRef.current = null
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isActive, gameOver, isPaused, moveLeft, moveRight])

  // Game loop
  useEffect(() => {
    if (!isActive || isPaused || gameOver) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frameCount = 0
    const currentSpeed = speed

    const gameLoop = () => {
      frameCount++

      // Update road offset for scrolling effect
      setRoadOffset(prev => (prev + currentSpeed) % 40)

      // Update distance and score with difficulty multiplier
      setDistance(d => {
        const newDistance = d + currentSpeed * 0.1
        const scoreMultiplier = difficulty?.scoreMultiplier || 1
        const distanceScore = Math.floor(newDistance * scoreMultiplier)
        setScore(distanceScore)
        onScoreUpdate(distanceScore)
        return newDistance
      })

      // Spawn obstacles with difficulty scaling (more frequent at higher difficulty)
      // Base spawn rate decreases as distance increases, minimum 30 frames
      const baseSpawnRate = Math.max(30, 70 - Math.floor(distance / 200))
      const difficultyAdjustment = (difficulty?.level || 1) * 3
      const obstacleSpawnRate = Math.max(25, baseSpawnRate - difficultyAdjustment)

      // Always spawn obstacles - use frame count modulo
      if (frameCount % obstacleSpawnRate === 0) {
        spawnObstacle()
        // At higher distances/difficulty, sometimes spawn 2 obstacles
        if (distance > 500 && Math.random() < 0.3 * obstacleFrequency) {
          setTimeout(() => spawnObstacle(), 100)
        }
      }
      if (frameCount % 45 === 0) {
        spawnCoin()
      }
      // Spawn power-ups occasionally
      if (frameCount % 180 === 0 && Math.random() < 0.5) {
        spawnPowerUp()
      }
      // Change weather randomly for variety
      if (frameCount % 600 === 0 && Math.random() < 0.3) {
        setWeather(WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)])
      }

      // Move obstacles
      setObstacles(prev => {
        const newObstacles = prev
          .map(obs => ({ ...obs, y: obs.y + currentSpeed + 2 }))
          .filter(obs => obs.y < CANVAS_HEIGHT + 100)
        return newObstacles
      })

      // Move coins (with magnet effect)
      setCoins(prev => {
        return prev
          .map(coin => {
            let newX = coin.x
            let newY = coin.y + currentSpeed + 2

            // Magnet effect pulls coins toward player
            if (hasMagnet && !coin.collected) {
              const dx = playerX + CAR_WIDTH / 2 - (coin.x + 10)
              const dy = playerY + CAR_HEIGHT / 2 - (coin.y + 10)
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist < 150) {
                newX += dx * 0.1
                newY += dy * 0.05
              }
            }

            return { ...coin, x: newX, y: newY }
          })
          .filter(coin => coin.y < CANVAS_HEIGHT + 50 && !coin.collected)
      })

      // Move power-ups
      setPowerUps(prev => {
        return prev
          .map(pu => ({ ...pu, y: pu.y + currentSpeed + 2 }))
          .filter(pu => pu.y < CANVAS_HEIGHT + 50 && !pu.collected)
      })

      // Check collisions
      const playerLeft = playerX
      const playerRight = playerX + CAR_WIDTH
      const playerTop = playerY
      const playerBottom = playerY + CAR_HEIGHT

      // Check obstacle collisions and near misses - do this outside of setState to avoid race conditions
      if (!isInvincible) {
        let collidedObstacle: Obstacle | null = null
        let nearMissDetected = false

        // First pass: detect collisions without modifying state
        for (const obs of obstacles) {
          const obsLeft = obs.x
          const obsRight = obs.x + OBSTACLE_WIDTH
          const obsTop = obs.y
          const obsBottom = obs.y + OBSTACLE_HEIGHT

          if (
            playerRight > obsLeft &&
            playerLeft < obsRight &&
            playerBottom > obsTop &&
            playerTop < obsBottom
          ) {
            collidedObstacle = obs
            break
          }

          // Near miss detection - obstacle passed by player closely
          const isNearMiss =
            obsTop > playerBottom &&
            obsTop < playerBottom + 20 &&
            Math.abs((obsLeft + OBSTACLE_WIDTH / 2) - (playerLeft + CAR_WIDTH / 2)) < LANE_WIDTH * 0.8

          if (isNearMiss && Date.now() - lastNearMissRef.current > 500) {
            nearMissDetected = true
          }
        }

        // Handle collision separately from detection
        if (collidedObstacle) {
          setObstacles(prev => prev.filter(o => o !== collidedObstacle))
          setLives(l => {
            const newLives = l - 1
            if (newLives <= 0 && !hasEndedRef.current) {
              hasEndedRef.current = true
              setGameOver(true)
              setTimeout(() => onGameEnd(Math.floor(distance), moves), 0)
            } else if (newLives > 0) {
              setIsInvincible(true)
              setTimeout(() => setIsInvincible(false), 2000)
            }
            return newLives
          })
        }

        // Handle near miss separately
        if (nearMissDetected) {
          lastNearMissRef.current = Date.now()
          const bonus = 25
          setScore(s => {
            const newScore = s + bonus
            onScoreUpdate(newScore)
            return newScore
          })
          setNearMissBonus({ show: true, points: bonus })
          setTimeout(() => setNearMissBonus({ show: false, points: 0 }), 1000)
        }
      }

      // Distance milestones
      const currentMilestone = Math.floor(distance / 500) * 500
      if (currentMilestone > 0 && currentMilestone !== milestone && currentMilestone > (milestone || 0)) {
        setMilestone(currentMilestone)
        const milestoneBonus = currentMilestone / 10
        setScore(s => {
          const newScore = s + milestoneBonus
          onScoreUpdate(newScore)
          return newScore
        })
        setTimeout(() => setMilestone(null), 2000)
      }

      // Check coin collisions
      setCoins(prev => {
        return prev.map(coin => {
          const coinLeft = coin.x
          const coinRight = coin.x + 20
          const coinTop = coin.y
          const coinBottom = coin.y + 20

          if (
            !coin.collected &&
            playerRight > coinLeft &&
            playerLeft < coinRight &&
            playerBottom > coinTop &&
            playerTop < coinBottom
          ) {
            // Coin collected with value and multiplier
            setScore(s => {
              const newScore = s + (coin.value * coinMultiplier)
              onScoreUpdate(newScore)
              return newScore
            })
            return { ...coin, collected: true }
          }
          return coin
        })
      })

      // Check power-up collisions
      setPowerUps(prev => {
        return prev.map(pu => {
          const puLeft = pu.x
          const puRight = pu.x + 24
          const puTop = pu.y
          const puBottom = pu.y + 24

          if (
            !pu.collected &&
            playerRight > puLeft &&
            playerLeft < puRight &&
            playerBottom > puTop &&
            playerTop < puBottom
          ) {
            // Power-up collected
            activatePowerUp(pu.type)
            return { ...pu, collected: true }
          }
          return pu
        })
      })

      // Increase speed over time
      if (frameCount % 300 === 0 && currentSpeed < 15) {
        setSpeed(s => Math.min(s + 0.5, 15))
      }

      // Draw everything
      drawGame(ctx)

      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    const drawGame = (ctx: CanvasRenderingContext2D) => {
      // Weather-based background colors
      const bgColors: Record<WeatherType, string> = {
        clear: "#374151",
        rain: "#1f2937",
        night: "#0f172a",
        sunset: "#4a1a2c"
      }

      // Clear canvas with weather color
      ctx.fillStyle = bgColors[weather]
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw road
      ctx.fillStyle = weather === "night" ? "#1e293b" : "#374151"
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw road lines (scrolling)
      ctx.strokeStyle = "#fbbf24"
      ctx.lineWidth = 4
      ctx.setLineDash([30, 20])

      for (let i = 1; i < LANE_COUNT; i++) {
        ctx.beginPath()
        ctx.moveTo(i * LANE_WIDTH, -40 + roadOffset)
        ctx.lineTo(i * LANE_WIDTH, CANVAS_HEIGHT)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Draw side lines
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(3, 0)
      ctx.lineTo(3, CANVAS_HEIGHT)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(CANVAS_WIDTH - 3, 0)
      ctx.lineTo(CANVAS_WIDTH - 3, CANVAS_HEIGHT)
      ctx.stroke()

      // Draw coins with size based on value
      coins.filter(c => !c.collected).forEach(coin => {
        const size = coin.value >= 50 ? 14 : coin.value >= 25 ? 12 : 10
        ctx.fillStyle = coin.value >= 100 ? "#c084fc" : coin.value >= 50 ? "#4ade80" : "#fbbf24"
        ctx.beginPath()
        ctx.arc(coin.x + 10, coin.y + 10, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = coin.value >= 100 ? "#a855f7" : coin.value >= 50 ? "#22c55e" : "#f59e0b"
        ctx.beginPath()
        ctx.arc(coin.x + 10, coin.y + 10, size - 4, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw power-ups
      powerUps.filter(pu => !pu.collected).forEach(pu => {
        ctx.fillStyle = POWER_UPS[pu.type].color
        ctx.beginPath()
        ctx.arc(pu.x + 12, pu.y + 12, 12, 0, Math.PI * 2)
        ctx.fill()
        // Inner glow
        ctx.fillStyle = "#fff"
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.arc(pu.x + 12, pu.y + 12, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        // Power-up symbol
        ctx.fillStyle = "#fff"
        ctx.font = "bold 10px sans-serif"
        ctx.textAlign = "center"
        const symbols: Record<keyof typeof POWER_UPS, string> = {
          shield: "S",
          magnet: "M",
          slowmo: "~",
          doubleCoins: "2x"
        }
        ctx.fillText(symbols[pu.type], pu.x + 12, pu.y + 16)
      })

      // Draw obstacles
      obstacles.forEach(obs => {
        ctx.fillStyle = obs.color

        if (obs.type === "car") {
          // Car body
          ctx.fillRect(obs.x + 5, obs.y, OBSTACLE_WIDTH - 10, OBSTACLE_HEIGHT)
          // Windows
          ctx.fillStyle = "#1e40af"
          ctx.fillRect(obs.x + 10, obs.y + 10, OBSTACLE_WIDTH - 20, 15)
          // Wheels
          ctx.fillStyle = "#1f2937"
          ctx.fillRect(obs.x, obs.y + 5, 8, 15)
          ctx.fillRect(obs.x + OBSTACLE_WIDTH - 8, obs.y + 5, 8, 15)
          ctx.fillRect(obs.x, obs.y + OBSTACLE_HEIGHT - 20, 8, 15)
          ctx.fillRect(obs.x + OBSTACLE_WIDTH - 8, obs.y + OBSTACLE_HEIGHT - 20, 8, 15)
        } else if (obs.type === "truck") {
          ctx.fillRect(obs.x + 3, obs.y, OBSTACLE_WIDTH - 6, OBSTACLE_HEIGHT + 20)
          ctx.fillStyle = "#1f2937"
          ctx.fillRect(obs.x - 2, obs.y + 5, 8, 20)
          ctx.fillRect(obs.x + OBSTACLE_WIDTH - 6, obs.y + 5, 8, 20)
        } else {
          // Cone
          ctx.fillStyle = "#f97316"
          ctx.beginPath()
          ctx.moveTo(obs.x + OBSTACLE_WIDTH / 2, obs.y)
          ctx.lineTo(obs.x + 5, obs.y + 40)
          ctx.lineTo(obs.x + OBSTACLE_WIDTH - 5, obs.y + 40)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = "#fff"
          ctx.fillRect(obs.x + 12, obs.y + 10, 16, 5)
          ctx.fillRect(obs.x + 10, obs.y + 25, 20, 5)
        }
      })

      // Draw player car
      const blinkOn = !isInvincible || Math.floor(Date.now() / 100) % 2 === 0
      if (blinkOn) {
        // Car body
        ctx.fillStyle = "#3b82f6"
        ctx.fillRect(playerX + 5, playerY, CAR_WIDTH - 10, CAR_HEIGHT)

        // Car front
        ctx.fillStyle = "#60a5fa"
        ctx.fillRect(playerX + 8, playerY + CAR_HEIGHT - 15, CAR_WIDTH - 16, 10)

        // Windows
        ctx.fillStyle = "#1e3a5f"
        ctx.fillRect(playerX + 10, playerY + 8, CAR_WIDTH - 20, 18)

        // Wheels
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(playerX, playerY + 5, 8, 15)
        ctx.fillRect(playerX + CAR_WIDTH - 8, playerY + 5, 8, 15)
        ctx.fillRect(playerX, playerY + CAR_HEIGHT - 20, 8, 15)
        ctx.fillRect(playerX + CAR_WIDTH - 8, playerY + CAR_HEIGHT - 20, 8, 15)

        // Headlights
        ctx.fillStyle = "#fef08a"
        ctx.fillRect(playerX + 10, playerY + CAR_HEIGHT - 5, 8, 5)
        ctx.fillRect(playerX + CAR_WIDTH - 18, playerY + CAR_HEIGHT - 5, 8, 5)

        // Shield effect when invincible
        if (isInvincible) {
          ctx.strokeStyle = "#3b82f6"
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(playerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, CAR_WIDTH * 0.8, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Weather effects overlay
      if (weather === "rain") {
        ctx.strokeStyle = "rgba(150, 200, 255, 0.3)"
        ctx.lineWidth = 1
        for (let i = 0; i < 50; i++) {
          const x = Math.random() * CANVAS_WIDTH
          const y = (Date.now() / 20 + i * 30) % CANVAS_HEIGHT
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - 2, y + 15)
          ctx.stroke()
        }
      } else if (weather === "night") {
        ctx.fillStyle = "rgba(0, 0, 20, 0.3)"
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      } else if (weather === "sunset") {
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
        gradient.addColorStop(0, "rgba(255, 100, 50, 0.2)")
        gradient.addColorStop(1, "rgba(200, 50, 100, 0.1)")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      }
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [isActive, isPaused, gameOver, speed, lane, isInvincible, spawnObstacle, spawnCoin, spawnPowerUp, activatePowerUp, onScoreUpdate, onGameEnd, playerX, playerY, distance, moves, obstacles, coins, powerUps, roadOffset, weather, hasMagnet, coinMultiplier])

  // Initial draw and spawn initial obstacles
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.fillStyle = "#374151"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Spawn initial obstacles so game isn't empty at start
    if (isActive && obstacles.length === 0) {
      // Spawn 2-3 initial obstacles at different positions
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          spawnObstacle()
        }, i * 500)
      }
      // Spawn initial coins
      setTimeout(() => spawnCoin(), 200)
      setTimeout(() => spawnCoin(), 700)
    }
  }, [isActive])

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Canvas */}
      <div
        className="relative select-none flex-shrink-0 overflow-hidden rounded-lg border-2 border-gray-700"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="bg-gray-800 touch-none select-none block"
          style={{ touchAction: "none" }}
        />

        {/* Near Miss Bonus */}
        {nearMissBonus.show && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 animate-bounce">
            <p className="text-green-400 font-bold text-lg drop-shadow-lg">
              Near Miss! +{nearMissBonus.points}
            </p>
          </div>
        )}

        {/* Distance Milestone */}
        {milestone && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className="text-amber-400 font-black text-2xl drop-shadow-lg animate-pulse">
              {milestone}m!
            </p>
            <p className="text-center text-amber-300 text-sm">+{milestone / 10} bonus</p>
          </div>
        )}

        {/* Pause Overlay */}
        {isPaused && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Pause className="h-12 w-12 mx-auto mb-2 text-white" />
              <p className="text-white font-bold">PAUSED</p>
              <p className="text-sm text-gray-400">Press P or Space to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Trophy className="h-12 w-12 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold mb-2">{hasWon ? <span className="text-green-500">YOU WIN!</span> : <span className="text-red-500">GAME OVER</span>}</p>
              <p className="text-white">Distance: {Math.floor(distance)}m</p>
              <p className="text-white mb-4">Score: {score.toLocaleString()}</p>
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
              <p className="font-bold text-lg text-green-400">{winThreshold.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Distance</p>
              <p className="font-bold text-lg text-cyan-400">{Math.floor(distance)}m</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Speed</p>
                <p className="font-bold text-cyan-400">{speed.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Lives</p>
                <div className="flex gap-1">
                  {Array(3).fill(0).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full ${i < lives ? "bg-red-500" : "bg-gray-700"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Active Power-up */}
            {activePowerUp && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: POWER_UPS[activePowerUp].color + "30" }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: POWER_UPS[activePowerUp].color }} />
                <span className="text-xs font-medium capitalize" style={{ color: POWER_UPS[activePowerUp].color }}>
                  {activePowerUp.replace(/([A-Z])/g, ' $1').trim()} Active
                </span>
              </div>
            )}
            {/* Weather indicator */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs">Weather:</span>
              <span className="text-xs font-medium capitalize text-white">{weather}</span>
            </div>
          </div>
        </Card>

        {/* Touch Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 bg-gray-800 border-gray-700 h-14 active:scale-95"
            onClick={moveLeft}
            onTouchStart={(e) => {
              e.preventDefault()
              moveLeft()
            }}
            disabled={!isActive || gameOver}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 bg-gray-800 border-gray-700 h-14 active:scale-95"
            onClick={moveRight}
            onTouchStart={(e) => {
              e.preventDefault()
              moveRight()
            }}
            disabled={!isActive || gameOver}
          >
            <ArrowRight className="h-6 w-6" />
          </Button>
        </div>

        {/* Pause Button */}
        <Button
          variant="outline"
          className="bg-gray-800 border-gray-700"
          onClick={() => setIsPaused(p => !p)}
          disabled={gameOver}
        >
          {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
          {isPaused ? "Resume" : "Pause"}
        </Button>

        {/* Controls Help */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Controls</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Left/Right arrows or A/D</li>
            <li>Collect coins for bonus</li>
            <li>Avoid obstacles</li>
            <li>P or Space to pause</li>
          </ul>
        </Card>

        {/* Power-up Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Power-ups</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">S</span>
              </div>
              <span className="text-xs text-gray-500">Shield - Invincibility</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">M</span>
              </div>
              <span className="text-xs text-gray-500">Magnet - Attracts coins</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">~</span>
              </div>
              <span className="text-xs text-gray-500">Slow-Mo - Slows time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">2x</span>
              </div>
              <span className="text-xs text-gray-500">Double - 2x coins</span>
            </div>
          </div>
        </Card>

        {/* Speed indicator */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-amber-500" />
            <div className="flex-1">
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(speed / 15) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
