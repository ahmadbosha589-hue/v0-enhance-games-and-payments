"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Play, Pause, ArrowLeft, ArrowRight, Fuel, Trophy, RotateCcw, Zap, Flame, Star, Heart } from "lucide-react"

const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 480
const CAR_WIDTH = 44
const CAR_HEIGHT = 68
const OBSTACLE_WIDTH = 44
const OBSTACLE_HEIGHT = 68
const LANE_COUNT = 3
const LANE_WIDTH = CANVAS_WIDTH / LANE_COUNT

// Weather types for visual variety
const WEATHER_TYPES = ["clear", "rain", "night", "sunset"] as const
type WeatherType = typeof WEATHER_TYPES[number]

// Power-up types with enhanced effects
const POWER_UPS = {
  shield: { duration: 5000, color: "#3b82f6", name: "Shield", icon: "S" },
  magnet: { duration: 8000, color: "#a855f7", name: "Magnet", icon: "M" },
  slowmo: { duration: 4000, color: "#22c55e", name: "Slow-Mo", icon: "~" },
  doubleCoins: { duration: 10000, color: "#fbbf24", name: "2x Coins", icon: "2" },
  frenzy: { duration: 6000, color: "#ef4444", name: "Frenzy", icon: "!" },
}

type PowerUpType = keyof typeof POWER_UPS | null

// Combo tiers with enhanced feedback
const COMBO_TIERS = [
  { min: 0, name: "", color: "#ffffff", multiplier: 1, particles: 5 },
  { min: 3, name: "NICE!", color: "#4ade80", multiplier: 1.5, particles: 8 },
  { min: 6, name: "GREAT!", color: "#60a5fa", multiplier: 2, particles: 10 },
  { min: 10, name: "AWESOME!", color: "#a855f7", multiplier: 2.5, particles: 12 },
  { min: 15, name: "AMAZING!", color: "#f472b6", multiplier: 3, particles: 15 },
  { min: 20, name: "INCREDIBLE!", color: "#fbbf24", multiplier: 4, particles: 18 },
  { min: 30, name: "LEGENDARY!", color: "#ef4444", multiplier: 5, particles: 22 },
  { min: 50, name: "GODLIKE!", color: "#ff6b6b", multiplier: 7, particles: 30 },
]

// Coin types with visual properties
const COIN_TYPES = {
  bronze: { value: 10, outerColor: "#fbbf24", innerColor: "#f59e0b", size: 10, glow: false },
  silver: { value: 25, outerColor: "#60a5fa", innerColor: "#3b82f6", size: 12, glow: false },
  gold: { value: 50, outerColor: "#4ade80", innerColor: "#22c55e", size: 14, glow: true },
  diamond: { value: 100, outerColor: "#c084fc", innerColor: "#a855f7", size: 16, glow: true },
}

interface Obstacle {
  id: number
  x: number
  y: number
  type: "car" | "truck" | "cone" | "bike" | "bus"
  lane: number
  color: string
  speed: number
  passed: boolean
}

interface Coin {
  id: number
  x: number
  y: number
  collected: boolean
  value: number
  coinType: keyof typeof COIN_TYPES
  rotation: number
  scale: number
  sparkle: number
  magnetized: boolean
}

interface PowerUp {
  id: number
  x: number
  y: number
  type: keyof typeof POWER_UPS
  collected: boolean
  rotation: number
  pulse: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  type: "coin" | "combo" | "spark" | "trail" | "explosion" | "star" | "ring"
  rotation?: number
  rotationSpeed?: number
}

interface FloatingText {
  id: number
  x: number
  y: number
  text: string
  color: string
  life: number
  maxLife: number
  scale: number
  vy: number
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

// Utility function - safer random
const safeRandom = (min: number, max: number) => min + Math.random() * (max - min)

export function CarRacingGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 300, initialScore = 0 }: CarRacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const frameCountRef = useRef<number>(0)
  const idCounterRef = useRef<number>(0)
  const gameEndedRef = useRef<boolean>(false)

  // Game state refs for the game loop (avoids stale closures)
  const gameStateRef = useRef({
    score: initialScore,
    distance: 0,
    baseSpeed: 5,
    currentSpeed: 5,
    lives: 3,
    gameOver: false,
    isPaused: false,
    hasWon: false,
    moves: 0,
    lane: 1,
    visualLane: 1,
    obstacles: [] as Obstacle[],
    coins: [] as Coin[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    isInvincible: false,
    invincibleUntil: 0,
    roadOffset: 0,
    weather: WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)] as WeatherType,
    activePowerUp: null as PowerUpType,
    powerUpUntil: 0,
    coinMultiplier: 1,
    hasMagnet: false,
    hasFrenzy: false,
    hasSlowmo: false,
    lastObstacleSpawn: 0,
    lastCoinSpawn: 0,
    lastPowerUpSpawn: 0,
    lastNearMiss: 0,
    // Enhanced Combo System
    combo: 0,
    maxCombo: 0,
    lastCoinCollect: 0,
    comboTimer: 0,
    comboDecayRate: 2500,
    totalCoinsCollected: 0,
    perfectStreak: 0,
    screenShake: 0,
    comboFreezeUntil: 0,
    // Visual state
    carTilt: 0,
    boostTrail: false,
    lastLane: 1,
    laneChangeTime: 0,
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
    maxCombo: 0,
    comboTier: COMBO_TIERS[0],
    comboTimeLeft: 0,
    totalCoinsCollected: 0,
    perfectStreak: 0,
    lastCollectValue: null as number | null,
    powerUpTimeLeft: 0,
  })

  const playerY = CANVAS_HEIGHT - CAR_HEIGHT - 25
  const obstacleColors = ["#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#9333ea", "#f97316", "#06b6d4"]

  // Difficulty settings
  const speedMultiplier = difficulty?.speedMultiplier || 1
  const scoreMultiplier = difficulty?.scoreMultiplier || 1
  const difficultyLevel = difficulty?.level || 1

  const resetGame = useCallback(() => {
    frameCountRef.current = 0
    idCounterRef.current = 0
    gameEndedRef.current = false
    const newWeather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]
    gameStateRef.current = {
      score: initialScore,
      distance: 0,
      baseSpeed: 5,
      currentSpeed: 5,
      lives: 3,
      gameOver: false,
      isPaused: false,
      hasWon: false,
      moves: 0,
      lane: 1,
      visualLane: 1,
      obstacles: [],
      coins: [],
      powerUps: [],
      particles: [],
      floatingTexts: [],
      isInvincible: false,
      invincibleUntil: 0,
      roadOffset: 0,
      weather: newWeather,
      activePowerUp: null,
      powerUpUntil: 0,
      coinMultiplier: 1,
      hasMagnet: false,
      hasFrenzy: false,
      hasSlowmo: false,
      lastObstacleSpawn: 0,
      lastCoinSpawn: 0,
      lastPowerUpSpawn: 0,
      lastNearMiss: 0,
      combo: 0,
      maxCombo: 0,
      lastCoinCollect: 0,
      comboTimer: 0,
      comboDecayRate: 2500,
      totalCoinsCollected: 0,
      perfectStreak: 0,
      screenShake: 0,
      comboFreezeUntil: 0,
      carTilt: 0,
      boostTrail: false,
      lastLane: 1,
      laneChangeTime: 0,
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
      weather: newWeather,
      nearMissBonus: null,
      milestone: null,
      combo: 0,
      maxCombo: 0,
      comboTier: COMBO_TIERS[0],
      comboTimeLeft: 0,
      totalCoinsCollected: 0,
      perfectStreak: 0,
      lastCollectValue: null,
      powerUpTimeLeft: 0,
    })
  }, [initialScore])

  const moveLeft = useCallback(() => {
    const gs = gameStateRef.current
    if (gs.isPaused || gs.gameOver) return
    if (gs.lane > 0) {
      gs.lastLane = gs.lane
      gs.lane = gs.lane - 1
      gs.laneChangeTime = Date.now()
      gs.moves++
    }
  }, [])

  const moveRight = useCallback(() => {
    const gs = gameStateRef.current
    if (gs.isPaused || gs.gameOver) return
    if (gs.lane < LANE_COUNT - 1) {
      gs.lastLane = gs.lane
      gs.lane = gs.lane + 1
      gs.laneChangeTime = Date.now()
      gs.moves++
    }
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
      if (dx > 35) {
        moveRight()
        touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() }
      } else if (dx < -35) {
        moveLeft()
        touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x
      const dt = Date.now() - touchStartRef.current.time
      if (dt < 200) {
        if (dx > 25) moveRight()
        else if (dx < -25) moveLeft()
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

    const getComboTier = (combo: number) => {
      for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
        if (combo >= COMBO_TIERS[i].min) return COMBO_TIERS[i]
      }
      return COMBO_TIERS[0]
    }

    const getCoinType = (value: number): keyof typeof COIN_TYPES => {
      if (value >= 100) return "diamond"
      if (value >= 50) return "gold"
      if (value >= 25) return "silver"
      return "bronze"
    }

    const spawnParticles = (gs: typeof gameStateRef.current, x: number, y: number, type: Particle["type"], count: number, color: string, extraSpeed = 1) => {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + safeRandom(-0.3, 0.3)
        let speed: number
        let size: number
        let life: number

        switch (type) {
          case "explosion":
            speed = safeRandom(3, 6) * extraSpeed
            size = safeRandom(4, 8)
            life = safeRandom(25, 40)
            break
          case "trail":
            speed = safeRandom(0.5, 1.5)
            size = safeRandom(2, 4)
            life = safeRandom(10, 20)
            break
          case "star":
            speed = safeRandom(2, 4)
            size = safeRandom(3, 6)
            life = safeRandom(30, 50)
            break
          case "ring":
            speed = safeRandom(1, 2)
            size = safeRandom(5, 10)
            life = safeRandom(20, 35)
            break
          case "combo":
            speed = safeRandom(2, 5) * extraSpeed
            size = safeRandom(3, 6)
            life = safeRandom(30, 45)
            break
          default:
            speed = safeRandom(1.5, 3.5) * extraSpeed
            size = safeRandom(2, 5)
            life = safeRandom(25, 40)
        }

        gs.particles.push({
          id: ++idCounterRef.current,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (type === "coin" ? 2 : 0),
          life,
          maxLife: life,
          color,
          size,
          type,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: safeRandom(-0.2, 0.2)
        })
      }
    }

    const spawnFloatingText = (gs: typeof gameStateRef.current, x: number, y: number, text: string, color: string, scale = 1.5) => {
      gs.floatingTexts.push({
        id: ++idCounterRef.current,
        x: Math.max(30, Math.min(CANVAS_WIDTH - 30, x)),
        y,
        text,
        color,
        life: 60,
        maxLife: 60,
        scale,
        vy: -1.5
      })
    }

    const spawnObstacle = (gs: typeof gameStateRef.current, forcedLane?: number) => {
      const newLane = forcedLane ?? Math.floor(Math.random() * LANE_COUNT)

      // Check for overlapping obstacles
      const tooClose = gs.obstacles.some(obs =>
        obs.lane === newLane && obs.y < OBSTACLE_HEIGHT * 1.5
      )
      if (tooClose) return

      const roll = Math.random()
      const type = roll > 0.5 ? "car" : roll > 0.3 ? "truck" : roll > 0.15 ? "bike" : roll > 0.05 ? "cone" : "bus"
      const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)]
      const speedVariation = safeRandom(0.3, 1.2)

      gs.obstacles.push({
        id: ++idCounterRef.current,
        x: (newLane * LANE_WIDTH) + (LANE_WIDTH - OBSTACLE_WIDTH) / 2,
        y: -OBSTACLE_HEIGHT - safeRandom(20, 60),
        type,
        lane: newLane,
        color,
        speed: speedVariation,
        passed: false
      })
    }

    const spawnCoin = (gs: typeof gameStateRef.current, forcedLane?: number) => {
      const coinLane = forcedLane ?? Math.floor(Math.random() * LANE_COUNT)

      // Weighted coin values
      const roll = Math.random()
      let value: number
      if (roll > 0.95) value = 100
      else if (roll > 0.85) value = 50
      else if (roll > 0.65) value = 25
      else value = 10

      // Frenzy bonus
      if (gs.hasFrenzy && Math.random() > 0.4) {
        value = Math.min(value * 2, 100)
      }

      const coinType = getCoinType(value)

      gs.coins.push({
        id: ++idCounterRef.current,
        x: (coinLane * LANE_WIDTH) + (LANE_WIDTH - 24) / 2,
        y: -24,
        collected: false,
        value,
        coinType,
        rotation: 0,
        scale: 1,
        sparkle: Math.random() * Math.PI * 2,
        magnetized: false
      })
    }

    const spawnPowerUp = (gs: typeof gameStateRef.current) => {
      const powerUpLane = Math.floor(Math.random() * LANE_COUNT)

      // Check for overlapping
      const tooClose = gs.powerUps.some(pu => pu.y < 100)
      if (tooClose) return

      const types = Object.keys(POWER_UPS) as (keyof typeof POWER_UPS)[]
      const type = types[Math.floor(Math.random() * types.length)]

      gs.powerUps.push({
        id: ++idCounterRef.current,
        x: (powerUpLane * LANE_WIDTH) + (LANE_WIDTH - 28) / 2,
        y: -28,
        type,
        collected: false,
        rotation: 0,
        pulse: 0
      })
    }

    const activatePowerUp = (gs: typeof gameStateRef.current, type: keyof typeof POWER_UPS) => {
      const now = Date.now()
      gs.activePowerUp = type
      gs.powerUpUntil = now + POWER_UPS[type].duration

      switch (type) {
        case "shield":
          gs.isInvincible = true
          gs.invincibleUntil = gs.powerUpUntil
          break
        case "magnet":
          gs.hasMagnet = true
          break
        case "slowmo":
          gs.hasSlowmo = true
          gs.currentSpeed = gs.baseSpeed * 0.5
          break
        case "doubleCoins":
          gs.coinMultiplier = 2
          break
        case "frenzy":
          gs.hasFrenzy = true
          gs.comboFreezeUntil = gs.powerUpUntil
          break
      }
    }

    const deactivatePowerUp = (gs: typeof gameStateRef.current) => {
      if (!gs.activePowerUp) return

      switch (gs.activePowerUp) {
        case "shield":
          if (!gs.isInvincible || gs.invincibleUntil <= Date.now()) {
            gs.isInvincible = false
          }
          break
        case "magnet":
          gs.hasMagnet = false
          break
        case "slowmo":
          gs.hasSlowmo = false
          gs.currentSpeed = gs.baseSpeed
          break
        case "doubleCoins":
          gs.coinMultiplier = 1
          break
        case "frenzy":
          gs.hasFrenzy = false
          break
      }
      gs.activePowerUp = null
    }

    const collectCoin = (gs: typeof gameStateRef.current, coin: Coin) => {
      if (coin.collected) return

      const now = Date.now()
      coin.collected = true
      gs.totalCoinsCollected++

      // Combo logic
      const timeSinceLastCollect = now - gs.lastCoinCollect
      const comboWindow = gs.hasFrenzy ? 4000 : 2500

      if (gs.combo === 0 || timeSinceLastCollect < comboWindow) {
        gs.combo++
        gs.perfectStreak++
      } else {
        gs.combo = 1
        gs.perfectStreak = 1
      }

      gs.lastCoinCollect = now
      gs.comboTimer = now

      if (gs.combo > gs.maxCombo) {
        gs.maxCombo = gs.combo
      }

      // Calculate score
      const tier = getComboTier(gs.combo)
      const baseValue = coin.value * gs.coinMultiplier
      const comboBonus = Math.floor(baseValue * (tier.multiplier - 1))
      const totalValue = baseValue + comboBonus

      gs.score += totalValue

      // Particles
      const coinData = COIN_TYPES[coin.coinType]
      const particleCount = tier.particles
      spawnParticles(gs, coin.x + 12, coin.y + 12, "coin", particleCount, coinData.outerColor)

      if (gs.combo >= 5) {
        spawnParticles(gs, coin.x + 12, coin.y + 12, "combo", Math.floor(gs.combo / 3), tier.color, 1.2)
      }

      // Floating text
      const displayText = comboBonus > 0 ? `+${totalValue} (${tier.multiplier}x)` : `+${totalValue}`
      spawnFloatingText(gs, coin.x + 12, coin.y, displayText, tier.color)

      // Screen shake
      if (gs.combo >= 10) {
        gs.screenShake = Math.min(gs.combo / 5, 8)
      }

      // Combo tier milestone
      const prevTier = getComboTier(gs.combo - 1)
      if (tier.name && tier.name !== prevTier.name) {
        spawnFloatingText(gs, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3, tier.name, tier.color, 2)
        spawnParticles(gs, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3, "explosion", 20, tier.color, 1.5)
        spawnParticles(gs, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3, "star", 10, "#ffffff")
        gs.screenShake = 10
      }

      setUiState(prev => ({ ...prev, lastCollectValue: totalValue }))
      setTimeout(() => setUiState(prev => ({ ...prev, lastCollectValue: null })), 500)
    }

    const handleCollision = (gs: typeof gameStateRef.current, obs: Obstacle, playerX: number) => {
      spawnParticles(gs, obs.x + OBSTACLE_WIDTH / 2, obs.y + OBSTACLE_HEIGHT / 2, "explosion", 25, "#ef4444", 1.3)
      spawnParticles(gs, playerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, "spark", 15, "#fbbf24")
      gs.screenShake = 12

      gs.lives--
      gs.combo = 0
      gs.perfectStreak = 0

      if (gs.lives <= 0 && !gameEndedRef.current) {
        gameEndedRef.current = true
        gs.gameOver = true
        setTimeout(() => onGameEnd(Math.floor(gs.score), gs.moves), 100)
      } else if (gs.lives > 0) {
        gs.isInvincible = true
        gs.invincibleUntil = Date.now() + 2000
      }
    }

    const gameLoop = (timestamp: number) => {
      const gs = gameStateRef.current

      if (gs.gameOver) {
        draw(ctx, gs)
        animationRef.current = requestAnimationFrame(gameLoop)
        return
      }

      if (gs.isPaused) {
        draw(ctx, gs)
        animationRef.current = requestAnimationFrame(gameLoop)
        return
      }

      // Delta time for consistent speed
      const rawDelta = timestamp - lastTimeRef.current
      const deltaTime = Math.min(rawDelta, 50) / 16.67
      lastTimeRef.current = timestamp
      frameCountRef.current++
      const frame = frameCountRef.current
      const now = Date.now()

      // Update effective speed
      const speedBoost = gs.hasSlowmo ? 0.5 : 1
      gs.currentSpeed = gs.baseSpeed * speedBoost * speedMultiplier

      // Combo decay
      if (gs.combo > 0 && now > gs.comboFreezeUntil) {
        const timeSinceCollect = now - gs.comboTimer
        if (timeSinceCollect > gs.comboDecayRate) {
          if (frame % 15 === 0) {
            gs.combo = Math.max(0, gs.combo - 1)
            gs.comboTimer = now - gs.comboDecayRate + 500
          }
        }
      }

      // Power-up expiration
      if (gs.activePowerUp && now > gs.powerUpUntil) {
        deactivatePowerUp(gs)
      }

      // Invincibility expiration (from collision)
      if (gs.isInvincible && gs.activePowerUp !== "shield" && now > gs.invincibleUntil) {
        gs.isInvincible = false
      }

      // Screen shake decay
      if (gs.screenShake > 0) {
        gs.screenShake *= 0.85
        if (gs.screenShake < 0.1) gs.screenShake = 0
      }

      // Car tilt based on lane changes
      const timeSinceLaneChange = now - gs.laneChangeTime
      if (timeSinceLaneChange < 200) {
        const direction = gs.lane > gs.lastLane ? 1 : gs.lane < gs.lastLane ? -1 : 0
        gs.carTilt = direction * 0.15 * (1 - timeSinceLaneChange / 200)
      } else {
        gs.carTilt *= 0.9
      }

      // Smooth lane transition
      const laneDiff = gs.lane - gs.visualLane
      if (Math.abs(laneDiff) > 0.01) {
        gs.visualLane += laneDiff * 0.22 * deltaTime
      } else {
        gs.visualLane = gs.lane
      }

      // Road offset
      gs.roadOffset = (gs.roadOffset + gs.currentSpeed * deltaTime) % 50

      // Distance and speed progression
      gs.distance += gs.currentSpeed * 0.1 * deltaTime

      // Win condition
      if (gs.score >= winThreshold && !gs.hasWon && !gameEndedRef.current) {
        gs.hasWon = true
        gs.gameOver = true
        gameEndedRef.current = true
        spawnParticles(gs, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, "star", 40, "#fbbf24", 2)
        setTimeout(() => onGameEnd(gs.score, gs.moves), 100)
      }

      // Update particles
      for (let i = gs.particles.length - 1; i >= 0; i--) {
        const p = gs.particles[i]
        p.x += p.vx * deltaTime
        p.y += p.vy * deltaTime

        if (p.type !== "trail" && p.type !== "ring") {
          p.vy += 0.12 * deltaTime
        }

        if (p.rotation !== undefined && p.rotationSpeed) {
          p.rotation += p.rotationSpeed * deltaTime
        }

        p.life -= deltaTime

        if (p.life <= 0) {
          gs.particles.splice(i, 1)
        }
      }

      // Update floating texts
      for (let i = gs.floatingTexts.length - 1; i >= 0; i--) {
        const ft = gs.floatingTexts[i]
        ft.y += ft.vy * deltaTime
        ft.life -= deltaTime
        ft.scale = Math.max(1, ft.scale - 0.015 * deltaTime)

        if (ft.life <= 0) {
          gs.floatingTexts.splice(i, 1)
        }
      }

      // Spawn obstacles
      const baseSpawnInterval = Math.max(350, 1100 - gs.distance * 1.8 - difficultyLevel * 70)
      if (now - gs.lastObstacleSpawn > baseSpawnInterval) {
        spawnObstacle(gs)
        gs.lastObstacleSpawn = now

        // Additional obstacles at higher distances
        if (gs.distance > 50 && Math.random() < 0.35) {
          const lastLane = gs.obstacles[gs.obstacles.length - 1]?.lane ?? 1
          const availableLanes = [0, 1, 2].filter(l => l !== lastLane)
          const extraLane = availableLanes[Math.floor(Math.random() * availableLanes.length)]
          setTimeout(() => {
            if (!gs.gameOver && !gs.isPaused) spawnObstacle(gs, extraLane)
          }, baseSpawnInterval * 0.3)
        }
      }

      // Spawn coins
      const coinInterval = gs.hasFrenzy ? 300 : 550
      if (now - gs.lastCoinSpawn > coinInterval) {
        spawnCoin(gs)
        gs.lastCoinSpawn = now

        if (gs.hasFrenzy && Math.random() < 0.5) {
          setTimeout(() => {
            if (!gs.gameOver && !gs.isPaused && gs.hasFrenzy) spawnCoin(gs)
          }, 120)
        }
      }

      // Spawn power-ups
      if (now - gs.lastPowerUpSpawn > 3200 && Math.random() < 0.3) {
        spawnPowerUp(gs)
        gs.lastPowerUpSpawn = now
      }

      // Weather changes
      if (frame % 800 === 0 && Math.random() < 0.2) {
        gs.weather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]
      }

      // Move obstacles
      const obstacleSpeedBonus = Math.min(gs.distance / 120, 2.5)
      for (let i = gs.obstacles.length - 1; i >= 0; i--) {
        const obs = gs.obstacles[i]
        obs.y += (gs.currentSpeed + 2 + obstacleSpeedBonus) * obs.speed * deltaTime

        if (obs.y > CANVAS_HEIGHT + 100) {
          gs.obstacles.splice(i, 1)
        }
      }

      // Move and animate coins
      const playerX = (gs.visualLane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      for (let i = gs.coins.length - 1; i >= 0; i--) {
        const coin = gs.coins[i]
        if (coin.collected) {
          gs.coins.splice(i, 1)
          continue
        }

        coin.y += (gs.currentSpeed + 2) * deltaTime
        coin.rotation += 0.08 * deltaTime
        coin.sparkle += 0.12 * deltaTime

        // Magnet effect
        if ((gs.hasMagnet || gs.hasFrenzy) && !coin.collected) {
          const dx = playerX + CAR_WIDTH / 2 - (coin.x + 12)
          const dy = playerY + CAR_HEIGHT / 2 - (coin.y + 12)
          const dist = Math.sqrt(dx * dx + dy * dy)

          const magnetRange = gs.hasMagnet ? 200 : 90
          const magnetStrength = gs.hasMagnet ? 0.25 : 0.08

          if (dist < magnetRange) {
            const strength = (magnetRange - dist) / magnetRange
            coin.x += dx * magnetStrength * strength * deltaTime
            coin.y += dy * magnetStrength * strength * 0.8 * deltaTime
            coin.magnetized = true

            // Trail particles for magnetized coins
            if (frame % 5 === 0 && gs.hasMagnet) {
              spawnParticles(gs, coin.x + 12, coin.y + 12, "trail", 1, COIN_TYPES[coin.coinType].outerColor)
            }
          } else {
            coin.magnetized = false
          }
        }

        // Missed coin
        if (coin.y > CANVAS_HEIGHT + 50) {
          gs.perfectStreak = 0
          gs.coins.splice(i, 1)
        }
      }

      // Move power-ups
      for (let i = gs.powerUps.length - 1; i >= 0; i--) {
        const pu = gs.powerUps[i]
        if (pu.collected) {
          gs.powerUps.splice(i, 1)
          continue
        }

        pu.y += (gs.currentSpeed + 2) * deltaTime
        pu.rotation += 0.04 * deltaTime
        pu.pulse += 0.1 * deltaTime

        if (pu.y > CANVAS_HEIGHT + 50) {
          gs.powerUps.splice(i, 1)
        }
      }

      // Collision detection
      const collisionX = (gs.lane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      const playerLeft = collisionX + 6
      const playerRight = collisionX + CAR_WIDTH - 6
      const playerTop = playerY + 6
      const playerBottom = playerY + CAR_HEIGHT - 6

      // Obstacle collisions
      if (!gs.isInvincible) {
        for (let i = gs.obstacles.length - 1; i >= 0; i--) {
          const obs = gs.obstacles[i]
          const obsLeft = obs.x + 6
          const obsRight = obs.x + OBSTACLE_WIDTH - 6
          const obsTop = obs.y + 6
          const obsBottom = obs.y + OBSTACLE_HEIGHT - 6

          if (playerRight > obsLeft && playerLeft < obsRight && playerBottom > obsTop && playerTop < obsBottom) {
            gs.obstacles.splice(i, 1)
            handleCollision(gs, obs, playerX)
            break
          }

          // Near miss
          if (!obs.passed && obs.y > playerBottom) {
            const horizontalDist = Math.abs((obsLeft + OBSTACLE_WIDTH / 2) - (playerLeft + CAR_WIDTH / 2))
            if (horizontalDist < LANE_WIDTH * 0.7 && now - gs.lastNearMiss > 500) {
              obs.passed = true
              gs.lastNearMiss = now
              const nearMissBonus = 20 + Math.floor(gs.combo / 3) * 5
              gs.score += nearMissBonus
              spawnFloatingText(gs, playerX + CAR_WIDTH / 2, playerY - 20, `CLOSE! +${nearMissBonus}`, "#22c55e", 1.2)
              spawnParticles(gs, playerX + CAR_WIDTH / 2, playerY, "spark", 6, "#22c55e")
              setUiState(prev => ({ ...prev, nearMissBonus: { points: nearMissBonus } }))
              setTimeout(() => setUiState(prev => ({ ...prev, nearMissBonus: null })), 800)
            }
          }
        }
      }

      // Coin collisions
      const coinHitboxBonus = gs.hasFrenzy ? 10 : 0
      for (const coin of gs.coins) {
        if (coin.collected) continue
        const coinLeft = coin.x - coinHitboxBonus
        const coinRight = coin.x + 24 + coinHitboxBonus
        const coinTop = coin.y - coinHitboxBonus
        const coinBottom = coin.y + 24 + coinHitboxBonus

        if (playerRight > coinLeft && playerLeft < coinRight && playerBottom > coinTop && playerTop < coinBottom) {
          collectCoin(gs, coin)
        }
      }

      // Power-up collisions
      for (const pu of gs.powerUps) {
        if (pu.collected) continue
        const puLeft = pu.x - 2
        const puRight = pu.x + 30
        const puTop = pu.y - 2
        const puBottom = pu.y + 30

        if (playerRight > puLeft && playerLeft < puRight && playerBottom > puTop && playerTop < puBottom) {
          pu.collected = true
          activatePowerUp(gs, pu.type)
          spawnParticles(gs, pu.x + 14, pu.y + 14, "explosion", 15, POWER_UPS[pu.type].color)
          spawnParticles(gs, pu.x + 14, pu.y + 14, "ring", 5, "#ffffff")
          spawnFloatingText(gs, pu.x + 14, pu.y - 15, POWER_UPS[pu.type].name, POWER_UPS[pu.type].color, 1.3)
        }
      }

      // Trail particles during frenzy
      if (gs.hasFrenzy && frame % 2 === 0) {
        spawnParticles(gs, playerX + CAR_WIDTH / 2 + safeRandom(-10, 10), playerY + CAR_HEIGHT, "trail", 1, "#ef4444")
      }

      // Speed progression
      if (frame % 180 === 0 && gs.baseSpeed < 16) {
        gs.baseSpeed = Math.min(gs.baseSpeed + 0.25, 16)
      }

      // Distance milestones
      if (gs.distance > 100 && gs.baseSpeed < 7) gs.baseSpeed = 7
      if (gs.distance > 200 && gs.baseSpeed < 9) gs.baseSpeed = 9
      if (gs.distance > 300 && gs.baseSpeed < 11) gs.baseSpeed = 11
      if (gs.distance > 500 && gs.baseSpeed < 13) gs.baseSpeed = 13

      // Distance milestone bonuses
      const currentMilestone = Math.floor(gs.distance / 500) * 500
      if (currentMilestone > 0) {
        const lastMilestone = Math.floor((gs.distance - gs.currentSpeed * 0.1 * deltaTime) / 500) * 500
        if (currentMilestone > lastMilestone) {
          gs.score += currentMilestone / 10
          setUiState(prev => ({ ...prev, milestone: currentMilestone }))
          setTimeout(() => setUiState(prev => ({ ...prev, milestone: null })), 2000)
        }
      }

      // Update UI
      if (frame % 2 === 0) {
        const comboTier = getComboTier(gs.combo)
        const comboTimeLeft = gs.combo > 0 ? Math.max(0, gs.comboDecayRate - (now - gs.comboTimer)) : 0
        const powerUpTimeLeft = gs.activePowerUp ? Math.max(0, gs.powerUpUntil - now) : 0

        onScoreUpdate(gs.score)
        setUiState(prev => ({
          ...prev,
          score: gs.score,
          distance: gs.distance,
          speed: gs.currentSpeed,
          lives: gs.lives,
          gameOver: gs.gameOver,
          hasWon: gs.hasWon,
          activePowerUp: gs.activePowerUp,
          weather: gs.weather,
          combo: gs.combo,
          maxCombo: gs.maxCombo,
          comboTier,
          comboTimeLeft,
          totalCoinsCollected: gs.totalCoinsCollected,
          perfectStreak: gs.perfectStreak,
          powerUpTimeLeft,
        }))
      }

      draw(ctx, gs)
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    const draw = (ctx: CanvasRenderingContext2D, gs: typeof gameStateRef.current) => {
      const bgColors: Record<WeatherType, string> = {
        clear: "#1e293b",
        rain: "#0f172a",
        night: "#020617",
        sunset: "#3b1f2b"
      }

      ctx.save()

      // Screen shake
      if (gs.screenShake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * gs.screenShake * 2,
          (Math.random() - 0.5) * gs.screenShake * 2
        )
      }

      // Background gradient
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      bgGradient.addColorStop(0, bgColors[gs.weather])
      bgGradient.addColorStop(1, "#000")
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Road
      ctx.fillStyle = "#374151"
      ctx.fillRect(8, 0, CANVAS_WIDTH - 16, CANVAS_HEIGHT)

      // Road lines
      ctx.strokeStyle = "#fbbf24"
      ctx.lineWidth = 4
      const dashLength = 35
      const gapLength = 25
      const totalLength = dashLength + gapLength

      for (let i = 1; i < LANE_COUNT; i++) {
        const x = 8 + (i * (CANVAS_WIDTH - 16) / LANE_COUNT)
        for (let y = -totalLength + (gs.roadOffset % totalLength); y < CANVAS_HEIGHT; y += totalLength) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, Math.min(y + dashLength, CANVAS_HEIGHT))
          ctx.stroke()
        }
      }

      // Side lines with glow
      ctx.shadowColor = "#ef4444"
      ctx.shadowBlur = 12
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(8, 0)
      ctx.lineTo(8, CANVAS_HEIGHT)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(CANVAS_WIDTH - 8, 0)
      ctx.lineTo(CANVAS_WIDTH - 8, CANVAS_HEIGHT)
      ctx.stroke()
      ctx.shadowBlur = 0

      // Particles (behind objects)
      for (const p of gs.particles) {
        const alpha = Math.max(0, p.life / p.maxLife)
        ctx.globalAlpha = alpha

        if (p.type === "trail") {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === "ring") {
          ctx.strokeStyle = p.color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1 + (1 - alpha) * 2), 0, Math.PI * 2)
          ctx.stroke()
        } else if (p.type === "star") {
          ctx.fillStyle = p.color
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation || 0)
          drawStar(ctx, 0, 0, p.size * 0.5, p.size, 5)
          ctx.restore()
        } else {
          ctx.fillStyle = p.color
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        }
        ctx.globalAlpha = 1
      }

      // Coins
      for (const coin of gs.coins) {
        if (coin.collected) continue

        const coinData = COIN_TYPES[coin.coinType]
        const shimmer = Math.sin(coin.sparkle * 3) * 0.3 + 0.7
        const magnetScale = coin.magnetized ? 1.15 : 1

        if (coinData.glow) {
          ctx.shadowColor = coinData.outerColor
          ctx.shadowBlur = 18
        }

        // Outer ring
        ctx.fillStyle = coinData.outerColor
        ctx.beginPath()
        ctx.arc(coin.x + 12, coin.y + 12, coinData.size * magnetScale, 0, Math.PI * 2)
        ctx.fill()

        // Inner circle
        ctx.fillStyle = coinData.innerColor
        ctx.beginPath()
        ctx.arc(coin.x + 12, coin.y + 12, (coinData.size - 4) * magnetScale, 0, Math.PI * 2)
        ctx.fill()

        // Shimmer
        ctx.globalAlpha = shimmer * 0.6
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(coin.x + 10, coin.y + 10, coinData.size / 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // Value indicator
        if (coin.value >= 25) {
          ctx.fillStyle = "#fff"
          ctx.font = `bold ${coin.value >= 50 ? 10 : 8}px sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(coin.value >= 100 ? "!" : coin.value.toString(), coin.x + 12, coin.y + 13)
        }

        ctx.shadowBlur = 0
      }

      // Power-ups
      for (const pu of gs.powerUps) {
        if (pu.collected) continue

        ctx.save()
        ctx.translate(pu.x + 14, pu.y + 14)

        const pulse = Math.sin(pu.pulse * 5) * 0.2 + 0.8

        // Glow
        ctx.shadowColor = POWER_UPS[pu.type].color
        ctx.shadowBlur = 25

        // Outer circle
        ctx.fillStyle = POWER_UPS[pu.type].color
        ctx.beginPath()
        ctx.arc(0, 0, 14, 0, Math.PI * 2)
        ctx.fill()

        // Inner pulse
        ctx.globalAlpha = pulse
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(0, 0, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // Icon
        ctx.fillStyle = POWER_UPS[pu.type].color
        ctx.font = "bold 12px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(POWER_UPS[pu.type].icon, 0, 1)

        ctx.shadowBlur = 0
        ctx.restore()
      }

      // Obstacles
      for (const obs of gs.obstacles) {
        drawObstacle(ctx, obs)
      }

      // Player car
      const currentPlayerX = (gs.visualLane * LANE_WIDTH) + (LANE_WIDTH - CAR_WIDTH) / 2
      const blinkOn = !gs.isInvincible || Math.floor(Date.now() / 100) % 2 === 0

      if (blinkOn) {
        ctx.save()
        ctx.translate(currentPlayerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2)
        ctx.rotate(gs.carTilt)
        ctx.translate(-CAR_WIDTH / 2, -CAR_HEIGHT / 2)

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)"
        ctx.fillRect(6, 4, CAR_WIDTH - 10, CAR_HEIGHT)

        // Body
        const carGradient = ctx.createLinearGradient(0, 0, CAR_WIDTH, 0)
        carGradient.addColorStop(0, "#2563eb")
        carGradient.addColorStop(0.5, "#3b82f6")
        carGradient.addColorStop(1, "#2563eb")
        ctx.fillStyle = carGradient
        ctx.fillRect(6, 0, CAR_WIDTH - 12, CAR_HEIGHT)

        // Roof
        ctx.fillStyle = "#60a5fa"
        ctx.fillRect(10, CAR_HEIGHT - 18, CAR_WIDTH - 20, 12)

        // Windshield
        ctx.fillStyle = "#1e3a5f"
        ctx.fillRect(12, 10, CAR_WIDTH - 24, 20)

        // Wheels
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(2, 6, 8, 16)
        ctx.fillRect(CAR_WIDTH - 10, 6, 8, 16)
        ctx.fillRect(2, CAR_HEIGHT - 22, 8, 16)
        ctx.fillRect(CAR_WIDTH - 10, CAR_HEIGHT - 22, 8, 16)

        // Headlights
        ctx.fillStyle = "#fef08a"
        ctx.shadowColor = "#fef08a"
        ctx.shadowBlur = 12
        ctx.fillRect(12, CAR_HEIGHT - 6, 8, 5)
        ctx.fillRect(CAR_WIDTH - 20, CAR_HEIGHT - 6, 8, 5)
        ctx.shadowBlur = 0

        ctx.restore()

        // Effects around car
        if (gs.isInvincible && gs.activePowerUp === "shield") {
          ctx.strokeStyle = "#3b82f6"
          ctx.lineWidth = 3
          ctx.shadowColor = "#3b82f6"
          ctx.shadowBlur = 18
          ctx.beginPath()
          ctx.arc(currentPlayerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, CAR_WIDTH * 0.9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        if (gs.hasFrenzy) {
          ctx.strokeStyle = "#ef4444"
          ctx.lineWidth = 2
          ctx.shadowColor = "#ef4444"
          ctx.shadowBlur = 22
          const time = Date.now() / 100
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = 0.7 - i * 0.2
            ctx.beginPath()
            ctx.arc(currentPlayerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, CAR_WIDTH * (0.6 + i * 0.15 + Math.sin(time + i) * 0.05), 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          ctx.shadowBlur = 0
        }

        if (gs.hasMagnet) {
          ctx.strokeStyle = "#a855f7"
          ctx.lineWidth = 2
          ctx.shadowColor = "#a855f7"
          ctx.shadowBlur = 15
          const time = Date.now() / 200
          ctx.setLineDash([5, 5])
          ctx.beginPath()
          ctx.arc(currentPlayerX + CAR_WIDTH / 2, playerY + CAR_HEIGHT / 2, 100 + Math.sin(time) * 10, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.shadowBlur = 0
        }
      }

      // Floating texts
      for (const ft of gs.floatingTexts) {
        const alpha = Math.max(0, ft.life / ft.maxLife)
        ctx.globalAlpha = alpha
        ctx.fillStyle = ft.color
        ctx.font = `bold ${Math.floor(14 * ft.scale)}px sans-serif`
        ctx.textAlign = "center"
        ctx.shadowColor = ft.color
        ctx.shadowBlur = 12
        ctx.fillText(ft.text, ft.x, ft.y)
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      // Combo display on canvas
      if (gs.combo >= 3) {
        const tier = getComboTier(gs.combo)
        const pulse = Math.sin(Date.now() / 150) * 0.1 + 1

        ctx.fillStyle = tier.color
        ctx.font = `bold ${Math.floor(24 * pulse)}px sans-serif`
        ctx.textAlign = "center"
        ctx.shadowColor = tier.color
        ctx.shadowBlur = 18
        ctx.fillText(`${gs.combo}x COMBO`, CANVAS_WIDTH / 2, 50)

        // Timer bar
        const timerWidth = 80
        const timerHeight = 6
        const timerX = CANVAS_WIDTH / 2 - timerWidth / 2
        const timerY = 58
        const timeLeft = Math.max(0, gs.comboDecayRate - (Date.now() - gs.comboTimer))
        const timerFill = gs.hasFrenzy ? 1 : timeLeft / gs.comboDecayRate

        ctx.fillStyle = "rgba(255,255,255,0.2)"
        ctx.fillRect(timerX, timerY, timerWidth, timerHeight)
        ctx.fillStyle = tier.color
        ctx.fillRect(timerX, timerY, timerWidth * timerFill, timerHeight)

        ctx.shadowBlur = 0
      }

      // Weather effects
      if (gs.weather === "rain") {
        ctx.strokeStyle = "rgba(150, 200, 255, 0.4)"
        ctx.lineWidth = 1
        for (let i = 0; i < 50; i++) {
          const x = (i * 47 + Date.now() / 10) % CANVAS_WIDTH
          const y = (Date.now() / 12 + i * 29) % CANVAS_HEIGHT
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - 3, y + 18)
          ctx.stroke()
        }
      } else if (gs.weather === "night") {
        ctx.fillStyle = "rgba(0, 0, 30, 0.35)"
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        ctx.fillStyle = "#fff"
        for (let i = 0; i < 15; i++) {
          const x = (i * 73) % CANVAS_WIDTH
          const y = ((i * 47) % 80) + 10
          const twinkle = Math.sin(Date.now() / 500 + i) * 0.5 + 0.5
          ctx.globalAlpha = twinkle
          ctx.beginPath()
          ctx.arc(x, y, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      } else if (gs.weather === "sunset") {
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
        gradient.addColorStop(0, "rgba(255, 120, 50, 0.2)")
        gradient.addColorStop(0.5, "rgba(255, 80, 80, 0.12)")
        gradient.addColorStop(1, "rgba(100, 50, 150, 0.08)")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      }

      ctx.restore()
    }

    const drawObstacle = (ctx: CanvasRenderingContext2D, obs: Obstacle) => {
      const { x, y, type, color } = obs

      if (type === "car") {
        ctx.fillStyle = color
        ctx.fillRect(x + 6, y, OBSTACLE_WIDTH - 12, OBSTACLE_HEIGHT)
        ctx.fillStyle = "#1e40af"
        ctx.fillRect(x + 10, y + 8, OBSTACLE_WIDTH - 20, 16)
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(x + 2, y + 6, 8, 16)
        ctx.fillRect(x + OBSTACLE_WIDTH - 10, y + 6, 8, 16)
        ctx.fillRect(x + 2, y + OBSTACLE_HEIGHT - 22, 8, 16)
        ctx.fillRect(x + OBSTACLE_WIDTH - 10, y + OBSTACLE_HEIGHT - 22, 8, 16)
        ctx.fillStyle = "#fef08a"
        ctx.fillRect(x + 10, y + OBSTACLE_HEIGHT - 6, 8, 4)
        ctx.fillRect(x + OBSTACLE_WIDTH - 18, y + OBSTACLE_HEIGHT - 6, 8, 4)
      } else if (type === "truck") {
        ctx.fillStyle = color
        ctx.fillRect(x + 4, y, OBSTACLE_WIDTH - 8, OBSTACLE_HEIGHT + 25)
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(x, y + 6, 8, 22)
        ctx.fillRect(x + OBSTACLE_WIDTH - 8, y + 6, 8, 22)
        ctx.fillRect(x, y + OBSTACLE_HEIGHT, 8, 22)
        ctx.fillRect(x + OBSTACLE_WIDTH - 8, y + OBSTACLE_HEIGHT, 8, 22)
      } else if (type === "bike") {
        ctx.fillStyle = color
        ctx.fillRect(x + 16, y, 12, OBSTACLE_HEIGHT - 12)
        ctx.fillStyle = "#1f2937"
        ctx.beginPath()
        ctx.arc(x + 22, y + 6, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + 22, y + OBSTACLE_HEIGHT - 18, 10, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === "bus") {
        ctx.fillStyle = "#facc15"
        ctx.fillRect(x + 2, y, OBSTACLE_WIDTH - 4, OBSTACLE_HEIGHT + 35)
        ctx.fillStyle = "#1e40af"
        for (let w = 0; w < 3; w++) {
          ctx.fillRect(x + 8, y + 8 + w * 25, OBSTACLE_WIDTH - 16, 12)
        }
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(x - 2, y + 8, 8, 18)
        ctx.fillRect(x + OBSTACLE_WIDTH - 6, y + 8, 8, 18)
        ctx.fillRect(x - 2, y + OBSTACLE_HEIGHT + 10, 8, 18)
        ctx.fillRect(x + OBSTACLE_WIDTH - 6, y + OBSTACLE_HEIGHT + 10, 8, 18)
      } else {
        // Cone
        ctx.fillStyle = "#f97316"
        ctx.beginPath()
        ctx.moveTo(x + OBSTACLE_WIDTH / 2, y)
        ctx.lineTo(x + 6, y + 45)
        ctx.lineTo(x + OBSTACLE_WIDTH - 6, y + 45)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#fff"
        ctx.fillRect(x + 14, y + 12, 16, 5)
        ctx.fillRect(x + 12, y + 28, 20, 5)
      }
    }

    const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, innerRadius: number, outerRadius: number, points: number) => {
      ctx.beginPath()
      for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius
        const angle = (i * Math.PI) / points - Math.PI / 2
        const x = cx + radius * Math.cos(angle)
        const y = cy + radius * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    }

    const getComboTier = (combo: number) => {
      for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
        if (combo >= COMBO_TIERS[i].min) return COMBO_TIERS[i]
      }
      return COMBO_TIERS[0]
    }

    // Initial draw
    draw(ctx, gameStateRef.current)

    // Start loop
    lastTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isActive, difficultyLevel, scoreMultiplier, speedMultiplier, initialScore, winThreshold, onGameEnd, onScoreUpdate, playerY])

  const comboProgress = uiState.combo > 0 ? uiState.comboTimeLeft / 2500 : 0
  const powerUpProgress = uiState.activePowerUp && uiState.powerUpTimeLeft > 0
    ? uiState.powerUpTimeLeft / POWER_UPS[uiState.activePowerUp].duration
    : 0

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Canvas */}
      <div
        className="relative select-none flex-shrink-0 overflow-hidden rounded-xl border-2 border-gray-700 shadow-2xl shadow-blue-500/20"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="bg-gray-900 touch-none select-none block"
          style={{ touchAction: "none" }}
        />

        {/* Near Miss Bonus */}
        {uiState.nearMissBonus && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 animate-bounce">
            <p className="text-green-400 font-bold text-lg drop-shadow-lg">
              Near Miss! +{uiState.nearMissBonus.points}
            </p>
          </div>
        )}

        {/* Distance Milestone */}
        {uiState.milestone && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className="text-amber-400 font-black text-3xl drop-shadow-lg animate-pulse">
              {uiState.milestone}m!
            </p>
            <p className="text-center text-amber-300 text-sm">+{uiState.milestone / 10} bonus</p>
          </div>
        )}

        {/* Pause Overlay */}
        {uiState.isPaused && !uiState.gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-xl backdrop-blur-sm">
            <div className="text-center">
              <Pause className="h-14 w-14 mx-auto mb-3 text-white" />
              <p className="text-white font-bold text-xl">PAUSED</p>
              <p className="text-sm text-gray-400 mt-2">Press P or Space to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {uiState.gameOver && (
          <div className="absolute inset-0 bg-black/85 flex items-center justify-center rounded-xl backdrop-blur-sm">
            <div className="text-center px-4">
              <Trophy className="h-14 w-14 mx-auto mb-3 text-yellow-500" />
              <p className="text-3xl font-black mb-3">
                {uiState.hasWon ? <span className="text-green-500">YOU WIN!</span> : <span className="text-red-500">GAME OVER</span>}
              </p>
              <div className="space-y-1 mb-4 text-sm">
                <p className="text-white">Distance: <span className="text-cyan-400 font-bold">{Math.floor(uiState.distance)}m</span></p>
                <p className="text-white">Score: <span className="text-amber-400 font-bold">{uiState.score.toLocaleString()}</span></p>
                <p className="text-white">Coins: <span className="text-yellow-400 font-bold">{uiState.totalCoinsCollected}</span></p>
                <p className="text-white">Max Combo: <span className="font-bold" style={{ color: getComboTierColor(uiState.maxCombo) }}>{uiState.maxCombo}x</span></p>
              </div>
              <Button onClick={resetGame} variant="outline" size="sm" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Play Again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      <div className="flex flex-col gap-3 min-w-[180px] w-full lg:w-auto">
        {/* Combo Display */}
        <Card className={`p-4 border-2 transition-all duration-300 ${uiState.combo >= 3 ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gray-900'}`} style={{ borderColor: uiState.comboTier.color + "80" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5" style={{ color: uiState.comboTier.color }} />
              <span className="text-gray-400 text-xs font-medium">COMBO</span>
            </div>
            {uiState.combo >= 3 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: uiState.comboTier.color + "30", color: uiState.comboTier.color }}>
                {uiState.comboTier.multiplier}x
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black" style={{ color: uiState.comboTier.color }}>
              {uiState.combo}
            </span>
            {uiState.comboTier.name && (
              <span className="text-sm font-bold" style={{ color: uiState.comboTier.color }}>
                {uiState.comboTier.name}
              </span>
            )}
          </div>
          {uiState.combo > 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${comboProgress * 100}%`,
                    backgroundColor: uiState.comboTier.color
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Max: {uiState.maxCombo}x</span>
            <span>Coins: {uiState.totalCoinsCollected}</span>
          </div>
        </Card>

        {/* Stats */}
        <Card className="p-4 bg-gray-900 border-gray-700">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-xs">Score</p>
                <p className="text-2xl font-bold text-white">{uiState.score.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-xs">Target</p>
                <p className="font-bold text-lg text-green-400">{winThreshold.toLocaleString()}</p>
              </div>
            </div>

            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((uiState.score / winThreshold) * 100, 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-400 text-xs">Distance</p>
                <p className="font-bold text-cyan-400">{Math.floor(uiState.distance)}m</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Speed</p>
                <p className="font-bold text-cyan-400">{uiState.speed.toFixed(1)}</p>
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-xs mb-1">Lives</p>
              <div className="flex gap-1.5">
                {Array(3).fill(0).map((_, i) => (
                  <Heart
                    key={i}
                    className={`w-5 h-5 transition-all duration-300 ${i < uiState.lives ? "text-red-500 fill-red-500" : "text-gray-700"}`}
                  />
                ))}
              </div>
            </div>

            {/* Active Power-up */}
            {uiState.activePowerUp && (
              <div className="p-2.5 rounded-lg" style={{ backgroundColor: POWER_UPS[uiState.activePowerUp].color + "20" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4" style={{ color: POWER_UPS[uiState.activePowerUp].color }} />
                  <span className="text-sm font-bold" style={{ color: POWER_UPS[uiState.activePowerUp].color }}>
                    {POWER_UPS[uiState.activePowerUp].name}
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${powerUpProgress * 100}%`,
                      backgroundColor: POWER_UPS[uiState.activePowerUp].color
                    }}
                  />
                </div>
              </div>
            )}

            {/* Weather */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Weather:</span>
              <span className="font-medium capitalize text-gray-300">{uiState.weather}</span>
            </div>
          </div>
        </Card>

        {/* Touch Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 bg-gray-800 border-gray-700 h-14 active:scale-95 transition-transform"
            onClick={moveLeft}
            onTouchStart={(e) => { e.preventDefault(); moveLeft() }}
            disabled={!isActive || uiState.gameOver}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 bg-gray-800 border-gray-700 h-14 active:scale-95 transition-transform"
            onClick={moveRight}
            onTouchStart={(e) => { e.preventDefault(); moveRight() }}
            disabled={!isActive || uiState.gameOver}
          >
            <ArrowRight className="h-6 w-6" />
          </Button>
        </div>

        {/* Pause */}
        <Button
          variant="outline"
          className="bg-gray-800 border-gray-700 h-11"
          onClick={togglePause}
          disabled={uiState.gameOver}
        >
          {uiState.isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
          {uiState.isPaused ? "Resume" : "Pause"}
        </Button>

        {/* Power-up Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium flex items-center gap-1.5">
            <Star className="h-3 w-3" /> Power-ups
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(POWER_UPS).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: value.color }} />
                <span className="text-[10px] text-gray-500">{value.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Speed gauge */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-amber-500" />
            <div className="flex-1">
              <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(uiState.speed / 16) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function getComboTierColor(combo: number): string {
  for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
    if (combo >= COMBO_TIERS[i].min) return COMBO_TIERS[i].color
  }
  return "#ffffff"
}
