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
  id: number
  x: number
  y: number
  type: "car" | "truck" | "cone" | "bike"
  lane: number
  color: string
  speed: number
}

interface Coin {
  id: number
  x: number
  y: number
  collected: boolean
  value: number
}

interface PowerUp {
  id: number
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
  winThreshold?: number
  initialScore?: number
}

export function CarRacingGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 300, initialScore = 0 }: CarRacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const frameCountRef = useRef<number>(0)
  const idCounterRef = useRef<number>(0)

  // Game state refs for the game loop (avoids stale closures)
  const gameStateRef = useRef({
    score: initialScore,
    distance: 0,
    speed: 5,
    lives: 3,
    gameOver: false,
    isPaused: false,
    hasWon: false,
    hasEnded: false,
    moves: 0,
    lane: 1,
    visualLane: 1,
    obstacles: [] as Obstacle[],
    coins: [] as Coin[],
    powerUps: [] as PowerUp[],
    isInvincible: false,
    invincibleUntil: 0,
    roadOffset: 0,
    weather: WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)] as WeatherType,
    activePowerUp: null as PowerUpType,
    powerUpUntil: 0,
    coinMultiplier: 1,
    hasMagnet: false,
    lastObstacleSpawn: 0,
    lastCoinSpawn: 0,
    lastPowerUpSpawn: 0,
    lastNearMiss: 0,
  })

  // UI state (for React rendering)
  const [uiState, setUiState] = useState({
    score: initialScore,
    distance: 0,
    speed: 5,
    lives: 3,
    gameOver: false,
    isPaused: false,
    hasWon: false,
    activePowerUp: null as PowerUpType,
    weather: gameStateRef.current.weather,
    nearMissBonus: null as { points: number } | null,
    milestone: null as number | null,
    combo: 0,
  })

  const playerY = CANVAS_HEIGHT - CAR_HEIGHT - 20
  const obstacleColors = ["#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#9333ea"]

  // Difficulty settings
  const speedMultiplier = difficulty?.speedMultiplier || 1
  const scoreMultiplier = difficulty?.scoreMultiplier || 1
  const difficultyLevel = difficulty?.level || 1

  const resetGame = useCallback(() => {
    frameCountRef.current = 0
    idCounterRef.current = 0
    gameStateRef.current = {
      score: initialScore,
      distance: 0,
      speed: 5,
      lives: 3,
      gameOver: false,
      isPaused: false,
      hasWon: false,
      hasEnded: false,
      moves: 0,
      lane: 1,
      visualLane: 1,
      obstacles: [],
      coins: [],
      powerUps: [],
      isInvincible: false,
      invincibleUntil: 0,
      roadOffset: 0,
      weather: WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)],
      activePowerUp: null,
      powerUpUntil: 0,
      coinMultiplier: 1,
      hasMagnet: false,
      lastObstacleSpawn: 0,
      lastCoinSpawn: 0,
      lastPowerUpSpawn: 0,
      lastNearMiss: 0,
      combo: 0,
      lastCoinCollect: 0,
    }
    setUiState({
      score: initialScore,
      distance: 0,
      speed: 5,
      lives: 3,
      gameOver: false,
      isPaused: false,
      hasWon: false,
      activePowerUp: null,
      weather: gameStateRef.current.weather,
      nearMissBonus: null,
      milestone: null,
      combo: 0,
    })
  }, [initialScore])

  const moveLeft = useCallback(() => {
    const gs = gameStateRef.current
    if (gs.isPaused || gs.gameOver) return
    gs.lane = Math.max(0, gs.lane - 1)
    gs.moves++
  }, [])

  const moveRight = useCallback(() => {
    const gs = gameStateRef.current
    if (gs.isPaused || gs.gameOver) return
    gs.lane = Math.min(LANE_COUNT - 1, gs.lane + 1)
    gs.moves++
  }, [])

  const togglePause = useCallback(() => {
    const gs = gameStateRef.current
    if (gs.gameOver) return
    gs.isPaused = !gs.isPaused
    setUiState(prev => ({ ...prev, isPaused: gs.isPaused }))
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || gameStateRef.current.gameOver) return
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
          togglePause()
          break
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, moveLeft, moveRight, togglePause])

  // Touch controls
  const touchStartRef = useRef<{ x: number; time: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleTouchStart = (e: TouchEvent) => {
      if (!isActive || gameStateRef.current.gameOver || gameStateRef.current.isPaused) return
      e.preventDefault()
      touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      e.preventDefault()
      const dx = e.touches[0].clientX - touchStartRef.current.x
      if (dx > 40) {
        moveRight()
        touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() }
      } else if (dx < -40) {
        moveLeft()
        touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x
      const dt = Date.now() - touchStartRef.current.time
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
  }, [isActive, moveLeft, moveRight])

  // Main game loop
  useEffect(() => {
    if (!isActive) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const spawnObstacle = (gs: typeof gameStateRef.current) => {
      const newLane = Math.floor(Math.random() * LANE_COUNT)
      const roll = Math.random()
      const type = roll > 0.4 ? "car" : roll > 0.2 ? "truck" : roll > 0.1 ? "bike" : "cone"
      const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)]
      const speedVariation = 0.3 + Math.random() * 1.2

      gs.obstacles.push({
        id: ++idCounterRef.current,
        x: (newLane * LANE_WIDTH) + (LANE_WIDTH - OBSTACLE_WIDTH) / 2,
        y: -OBSTACLE_HEIGHT - Math.random() * 50,
        type,
        lane: newLane,
        color,
        speed: speedVariation
      })
    }

    const spawnCoin = (gs: typeof gameStateRef.current) => {
      const coinLane = Math.floor(Math.random() * LANE_COUNT)
      const coinValues = [10, 10, 10, 25, 25, 50, 100]
      const value = coinValues[Math.floor(Math.random() * coinValues.length)]
      gs.coins.push({
        id: ++idCounterRef.current,
        x: (coinLane * LANE_WIDTH) + (LANE_WIDTH - 20) / 2,
        y: -20,
        collected: false,
        value
      })
    }

    const spawnPowerUp = (gs: typeof gameStateRef.current) => {
      const powerUpLane = Math.floor(Math.random() * LANE_COUNT)
      const types = Object.keys(POWER_UPS) as (keyof typeof POWER_UPS)[]
      const type = types[Math.floor(Math.random() * types.length)]
      gs.powerUps.push({
        id: ++idCounterRef.current,
        x: (powerUpLane * LANE_WIDTH) + (LANE_WIDTH - 24) / 2,
        y: -24,
        type,
        collected: false
      })
    }

    const activatePowerUp = (gs: typeof gameStateRef.current, type: keyof typeof POWER_UPS) => {
      const now = Date.now()
      gs.activePowerUp = type
      gs.powerUpUntil = now + POWER_UPS[type].duration

      if (type === "shield") {
        gs.isInvincible = true
        gs.invincibleUntil = gs.powerUpUntil
      } else if (type === "magnet") {
        gs.hasMagnet = true
      } else if (type === "slowmo") {
        gs.speed = Math.max(3, gs.speed * 0.5)
      } else if (type === "doubleCoins") {
        gs.coinMultiplier = 2
      }
    }

    const gameLoop = (timestamp: number) => {
      const gs = gameStateRef.current

      if (gs.gameOver || gs.isPaused) {
        draw(ctx, gs)
        animationRef.current = requestAnimationFrame(gameLoop)
        return
      }

      // Delta time for consistent speed
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 50) / 16.67
      lastTimeRef.current = timestamp
      frameCountRef.current++
      const frame = frameCountRef.current
      const now = Date.now()

      // Check power-up expiration
      if (gs.activePowerUp && now > gs.powerUpUntil) {
        if (gs.activePowerUp === "shield") gs.isInvincible = false
        if (gs.activePowerUp === "magnet") gs.hasMagnet = false
        if (gs.activePowerUp === "slowmo") gs.speed = Math.min(15, gs.speed * 2)
        if (gs.activePowerUp === "doubleCoins") gs.coinMultiplier = 1
        gs.activePowerUp = null
      }

      // Check invincibility expiration (from collision)
      if (gs.isInvincible && !gs.activePowerUp && now > gs.invincibleUntil) {
        gs.isInvincible = false
      }

      // Smooth lane transition
      const laneDiff = gs.lane - gs.visualLane
      if (Math.abs(laneDiff) > 0.01) {
        gs.visualLane += laneDiff * 0.2 * deltaTime
      } else {
        gs.visualLane = gs.lane
      }

      // Update road offset
      gs.roadOffset = (gs.roadOffset + gs.speed * deltaTime) % 50

      // Update distance and score
      gs.distance += gs.speed * 0.1 * deltaTime
      gs.score = Math.floor(gs.distance * scoreMultiplier) + initialScore

      // Check win condition
      if (gs.score >= winThreshold && !gs.hasWon && !gs.hasEnded) {
        gs.hasWon = true
        gs.gameOver = true
        gs.hasEnded = true
        setTimeout(() => onGameEnd(gs.score, gs.moves), 0)
      }

      // Spawn obstacles - use time-based spawning for consistency
      // More aggressive spawning at higher distances to ensure continuous challenge
      const baseSpawnInterval = Math.max(400, 1200 - gs.distance * 2 - difficultyLevel * 80)
      if (now - gs.lastObstacleSpawn > baseSpawnInterval) {
        spawnObstacle(gs)
        gs.lastObstacleSpawn = now

        // Spawn additional obstacles at higher distances for more challenge
        if (gs.distance > 50 && Math.random() < 0.4) {
          // Spawn in a different lane to avoid impossible situations
          const currentLane = gs.obstacles[gs.obstacles.length - 1]?.lane ?? 1
          const availableLanes = [0, 1, 2].filter(l => l !== currentLane)
          const extraLane = availableLanes[Math.floor(Math.random() * availableLanes.length)]

          const roll = Math.random()
          const type = roll > 0.4 ? "car" : roll > 0.2 ? "truck" : roll > 0.1 ? "bike" : "cone"
          const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)]

          gs.obstacles.push({
            id: ++idCounterRef.current,
            x: (extraLane * LANE_WIDTH) + (LANE_WIDTH - OBSTACLE_WIDTH) / 2,
            y: -OBSTACLE_HEIGHT - 80 - Math.random() * 60,
            type,
            lane: extraLane,
            color,
            speed: 0.4 + Math.random() * 1.0
          })
        }

        // Even more obstacles at very high distances (200+)
        if (gs.distance > 200 && Math.random() < 0.5) {
          setTimeout(() => {
            if (!gs.gameOver && !gs.isPaused) spawnObstacle(gs)
          }, baseSpawnInterval * 0.4)
        }

        // Extreme mode at 400+ distance
        if (gs.distance > 400 && Math.random() < 0.3) {
          setTimeout(() => {
            if (!gs.gameOver && !gs.isPaused) spawnObstacle(gs)
          }, baseSpawnInterval * 0.6)
        }
      }

      // Spawn coins
      if (now - gs.lastCoinSpawn > 700) {
        spawnCoin(gs)
        gs.lastCoinSpawn = now
      }

      // Spawn power-ups
      if (now - gs.lastPowerUpSpawn > 3000 && Math.random() < 0.4) {
        spawnPowerUp(gs)
        gs.lastPowerUpSpawn = now
      }

      // Change weather occasionally
      if (frame % 600 === 0 && Math.random() < 0.3) {
        gs.weather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]
      }

      // Move obstacles - faster movement at higher distances
      const obstacleSpeedBonus = Math.min(gs.distance / 100, 3)
      for (let i = gs.obstacles.length - 1; i >= 0; i--) {
        const obs = gs.obstacles[i]
        obs.y += (gs.speed + 2 + obstacleSpeedBonus) * obs.speed * deltaTime
        if (obs.y > CANVAS_HEIGHT + 100) {
          gs.obstacles.splice(i, 1)
        }
      }

      // Move coins
      const playerX = (gs.visualLane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      for (let i = gs.coins.length - 1; i >= 0; i--) {
        const coin = gs.coins[i]
        coin.y += (gs.speed + 2) * deltaTime

        // Magnet effect
        if (gs.hasMagnet && !coin.collected) {
          const dx = playerX + CAR_WIDTH / 2 - (coin.x + 10)
          const dy = playerY + CAR_HEIGHT / 2 - (coin.y + 10)
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            coin.x += dx * 0.15 * deltaTime
            coin.y += dy * 0.1 * deltaTime
          }
        }

        if (coin.y > CANVAS_HEIGHT + 50 || coin.collected) {
          gs.coins.splice(i, 1)
        }
      }

      // Move power-ups
      for (let i = gs.powerUps.length - 1; i >= 0; i--) {
        const pu = gs.powerUps[i]
        pu.y += (gs.speed + 2) * deltaTime
        if (pu.y > CANVAS_HEIGHT + 50 || pu.collected) {
          gs.powerUps.splice(i, 1)
        }
      }

      // Collision detection
      const collisionX = (gs.lane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      const playerLeft = collisionX
      const playerRight = collisionX + CAR_WIDTH
      const playerTop = playerY
      const playerBottom = playerY + CAR_HEIGHT

      // Obstacle collisions
      if (!gs.isInvincible) {
        for (let i = gs.obstacles.length - 1; i >= 0; i--) {
          const obs = gs.obstacles[i]
          const obsLeft = obs.x
          const obsRight = obs.x + OBSTACLE_WIDTH
          const obsTop = obs.y
          const obsBottom = obs.y + OBSTACLE_HEIGHT

          if (playerRight > obsLeft && playerLeft < obsRight && playerBottom > obsTop && playerTop < obsBottom) {
            gs.obstacles.splice(i, 1)
            gs.lives--

            if (gs.lives <= 0 && !gs.hasEnded) {
              gs.hasEnded = true
              gs.gameOver = true
              setTimeout(() => onGameEnd(Math.floor(gs.distance), gs.moves), 0)
            } else if (gs.lives > 0) {
              gs.isInvincible = true
              gs.invincibleUntil = now + 2000
            }
            break
          }

          // Near miss detection
          const isNearMiss = obsTop > playerBottom && obsTop < playerBottom + 25 &&
            Math.abs((obsLeft + OBSTACLE_WIDTH / 2) - (playerLeft + CAR_WIDTH / 2)) < LANE_WIDTH * 0.7

          if (isNearMiss && now - gs.lastNearMiss > 500) {
            gs.lastNearMiss = now
            gs.score += 25
            setUiState(prev => ({ ...prev, nearMissBonus: { points: 25 } }))
            setTimeout(() => setUiState(prev => ({ ...prev, nearMissBonus: null })), 1000)
          }
        }
      }

      // Coin collisions
      for (const coin of gs.coins) {
        if (coin.collected) continue
        const coinLeft = coin.x
        const coinRight = coin.x + 20
        const coinTop = coin.y
        const coinBottom = coin.y + 20

        if (playerRight > coinLeft && playerLeft < coinRight && playerBottom > coinTop && playerTop < coinBottom) {
          coin.collected = true
          gs.score += coin.value * gs.coinMultiplier
        }
      }

      // Power-up collisions
      for (const pu of gs.powerUps) {
        if (pu.collected) continue
        const puLeft = pu.x
        const puRight = pu.x + 24
        const puTop = pu.y
        const puBottom = pu.y + 24

        if (playerRight > puLeft && playerLeft < puRight && playerBottom > puTop && playerTop < puBottom) {
          pu.collected = true
          activatePowerUp(gs, pu.type)
        }
      }

      // Increase speed over time - more gradual and continuous
      if (frame % 200 === 0 && gs.speed < 18) {
        gs.speed = Math.min(gs.speed + 0.3, 18)
      }

      // Boost speed based on distance milestones
      if (gs.distance > 100 && gs.speed < 8) gs.speed = 8
      if (gs.distance > 200 && gs.speed < 10) gs.speed = 10
      if (gs.distance > 300 && gs.speed < 12) gs.speed = 12
      if (gs.distance > 500 && gs.speed < 14) gs.speed = 14

      // Distance milestones
      const currentMilestone = Math.floor(gs.distance / 500) * 500
      if (currentMilestone > 0) {
        const lastMilestone = Math.floor((gs.distance - gs.speed * 0.1 * deltaTime) / 500) * 500
        if (currentMilestone > lastMilestone) {
          gs.score += currentMilestone / 10
          setUiState(prev => ({ ...prev, milestone: currentMilestone }))
          setTimeout(() => setUiState(prev => ({ ...prev, milestone: null })), 2000)
        }
      }

      // Update UI state periodically (not every frame to avoid re-renders)
      if (frame % 3 === 0) {
        onScoreUpdate(gs.score)
        setUiState(prev => ({
          ...prev,
          score: gs.score,
          distance: gs.distance,
          speed: gs.speed,
          lives: gs.lives,
          gameOver: gs.gameOver,
          hasWon: gs.hasWon,
          activePowerUp: gs.activePowerUp,
          weather: gs.weather,
        }))
      }

      draw(ctx, gs)
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    const draw = (ctx: CanvasRenderingContext2D, gs: typeof gameStateRef.current) => {
      const bgColors: Record<WeatherType, string> = {
        clear: "#374151",
        rain: "#1f2937",
        night: "#0f172a",
        sunset: "#4a1a2c"
      }

      // Clear canvas
      ctx.fillStyle = bgColors[gs.weather]
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw road lines
      ctx.strokeStyle = "#fbbf24"
      ctx.lineWidth = 4
      const dashLength = 30
      const gapLength = 20
      const totalLength = dashLength + gapLength

      for (let i = 1; i < LANE_COUNT; i++) {
        const x = i * LANE_WIDTH
        for (let y = -totalLength + (gs.roadOffset % totalLength); y < CANVAS_HEIGHT; y += totalLength) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, Math.min(y + dashLength, CANVAS_HEIGHT))
          ctx.stroke()
        }
      }

      // Side lines
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

      // Draw coins
      for (const coin of gs.coins) {
        if (coin.collected) continue
        const size = coin.value >= 50 ? 14 : coin.value >= 25 ? 12 : 10
        ctx.fillStyle = coin.value >= 100 ? "#c084fc" : coin.value >= 50 ? "#4ade80" : "#fbbf24"
        ctx.beginPath()
        ctx.arc(coin.x + 10, coin.y + 10, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = coin.value >= 100 ? "#a855f7" : coin.value >= 50 ? "#22c55e" : "#f59e0b"
        ctx.beginPath()
        ctx.arc(coin.x + 10, coin.y + 10, size - 4, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw power-ups
      for (const pu of gs.powerUps) {
        if (pu.collected) continue
        ctx.fillStyle = POWER_UPS[pu.type].color
        ctx.beginPath()
        ctx.arc(pu.x + 12, pu.y + 12, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#fff"
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.arc(pu.x + 12, pu.y + 12, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.font = "bold 10px sans-serif"
        ctx.textAlign = "center"
        const symbols: Record<keyof typeof POWER_UPS, string> = {
          shield: "S", magnet: "M", slowmo: "~", doubleCoins: "2x"
        }
        ctx.fillText(symbols[pu.type], pu.x + 12, pu.y + 16)
      }

      // Draw obstacles
      for (const obs of gs.obstacles) {
        ctx.fillStyle = obs.color
        if (obs.type === "car") {
          ctx.fillRect(obs.x + 5, obs.y, OBSTACLE_WIDTH - 10, OBSTACLE_HEIGHT)
          ctx.fillStyle = "#1e40af"
          ctx.fillRect(obs.x + 10, obs.y + 10, OBSTACLE_WIDTH - 20, 15)
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
        } else if (obs.type === "bike") {
          ctx.fillRect(obs.x + 15, obs.y, 10, OBSTACLE_HEIGHT - 10)
          ctx.fillStyle = "#1f2937"
          ctx.beginPath()
          ctx.arc(obs.x + 20, obs.y + 5, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(obs.x + 20, obs.y + OBSTACLE_HEIGHT - 15, 8, 0, Math.PI * 2)
          ctx.fill()
        } else {
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
      }

      // Draw player car
      const currentPlayerX = (gs.visualLane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      const blinkOn = !gs.isInvincible || Math.floor(Date.now() / 100) % 2 === 0

      if (blinkOn) {
        ctx.fillStyle = "#3b82f6"
        ctx.fillRect(currentPlayerX + 5, playerY, CAR_WIDTH - 10, CAR_HEIGHT)
        ctx.fillStyle = "#60a5fa"
        ctx.fillRect(currentPlayerX + 8, playerY + CAR_HEIGHT - 15, CAR_WIDTH - 16, 10)
        ctx.fillStyle = "#1e3a5f"
        ctx.fillRect(currentPlayerX + 10, playerY + 8, CAR_WIDTH - 20, 18)
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(currentPlayerX, playerY + 5, 8, 15)
        ctx.fillRect(currentPlayerX + CAR_WIDTH - 8, playerY + 5, 8, 15)
        ctx.fillRect(currentPlayerX, playerY + CAR_HEIGHT - 20, 8, 15)
        ctx.fillRect(currentPlayerX + CAR_WIDTH - 8, playerY + CAR_HEIGHT - 20, 8, 15)
        ctx.fillStyle = "#fef08a"
        ctx.fillRect(currentPlayerX + 10, playerY + CAR_HEIGHT - 5, 8, 5)
        ctx.fillRect(currentPlayerX + CAR_WIDTH - 18, playerY + CAR_HEIGHT - 5, 8, 5)

        if (gs.isInvincible) {
          ctx.strokeStyle = "#3b82f6"
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(currentPlayerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, CAR_WIDTH * 0.8, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Weather effects
      if (gs.weather === "rain") {
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
      } else if (gs.weather === "night") {
        ctx.fillStyle = "rgba(0, 0, 20, 0.3)"
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      } else if (gs.weather === "sunset") {
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
        gradient.addColorStop(0, "rgba(255, 100, 50, 0.2)")
        gradient.addColorStop(1, "rgba(200, 50, 100, 0.1)")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      }
    }

    // Initial draw
    draw(ctx, gameStateRef.current)

    // Start game loop
    lastTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isActive, difficultyLevel, scoreMultiplier, initialScore, winThreshold, onGameEnd, onScoreUpdate, playerY])

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
        {uiState.nearMissBonus && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 animate-bounce">
            <p className="text-green-400 font-bold text-lg drop-shadow-lg">
              Near Miss! +{uiState.nearMissBonus.points}
            </p>
          </div>
        )}

        {/* Distance Milestone */}
        {uiState.milestone && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className="text-amber-400 font-black text-2xl drop-shadow-lg animate-pulse">
              {uiState.milestone}m!
            </p>
            <p className="text-center text-amber-300 text-sm">+{uiState.milestone / 10} bonus</p>
          </div>
        )}

        {/* Pause Overlay */}
        {uiState.isPaused && !uiState.gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Pause className="h-12 w-12 mx-auto mb-2 text-white" />
              <p className="text-white font-bold">PAUSED</p>
              <p className="text-sm text-gray-400">Press P or Space to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {uiState.gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Trophy className="h-12 w-12 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold mb-2">{uiState.hasWon ? <span className="text-green-500">YOU WIN!</span> : <span className="text-red-500">GAME OVER</span>}</p>
              <p className="text-white">Distance: {Math.floor(uiState.distance)}m</p>
              <p className="text-white mb-4">Score: {uiState.score.toLocaleString()}</p>
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
              <p className="text-2xl font-bold text-white">{uiState.score.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Target</p>
              <p className="font-bold text-lg text-green-400">{winThreshold.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Distance</p>
              <p className="font-bold text-lg text-cyan-400">{Math.floor(uiState.distance)}m</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Speed</p>
                <p className="font-bold text-cyan-400">{uiState.speed.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Lives</p>
                <div className="flex gap-1">
                  {Array(3).fill(0).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full ${i < uiState.lives ? "bg-red-500" : "bg-gray-700"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Active Power-up */}
            {uiState.activePowerUp && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: POWER_UPS[uiState.activePowerUp].color + "30" }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: POWER_UPS[uiState.activePowerUp].color }} />
                <span className="text-xs font-medium capitalize" style={{ color: POWER_UPS[uiState.activePowerUp].color }}>
                  {uiState.activePowerUp.replace(/([A-Z])/g, ' $1').trim()} Active
                </span>
              </div>
            )}
            {/* Weather indicator */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs">Weather:</span>
              <span className="text-xs font-medium capitalize text-white">{uiState.weather}</span>
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
            onTouchStart={(e) => { e.preventDefault(); moveLeft() }}
            disabled={!isActive || uiState.gameOver}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 bg-gray-800 border-gray-700 h-14 active:scale-95"
            onClick={moveRight}
            onTouchStart={(e) => { e.preventDefault(); moveRight() }}
            disabled={!isActive || uiState.gameOver}
          >
            <ArrowRight className="h-6 w-6" />
          </Button>
        </div>

        {/* Pause Button */}
        <Button
          variant="outline"
          className="bg-gray-800 border-gray-700"
          onClick={togglePause}
          disabled={uiState.gameOver}
        >
          {uiState.isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
          {uiState.isPaused ? "Resume" : "Pause"}
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
                  style={{ width: `${(uiState.speed / 15) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
