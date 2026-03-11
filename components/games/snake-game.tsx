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

const BOARD_SIZE = 20
const CELL_SIZE = 16
const INITIAL_SPEED = 150
const SPEED_INCREASE = 5

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
type Position = { x: number; y: number }
type FoodType = "normal" | "bonus" | "golden" | "speed" | "slow"

interface Food extends Position {
  type: FoodType
  points: number
  expireAt?: number
}

interface SnakeGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
}

const FOOD_TYPES: Record<FoodType, { color: string; points: number; chance: number }> = {
  normal: { color: "#ef4444", points: 10, chance: 0.6 },
  bonus: { color: "#22c55e", points: 25, chance: 0.2 },
  golden: { color: "#fbbf24", points: 50, chance: 0.1 },
  speed: { color: "#3b82f6", points: 15, chance: 0.05 },
  slow: { color: "#a855f7", points: 15, chance: 0.05 },
}

export function SnakeGame({ onGameEnd, onScoreUpdate, isActive }: SnakeGameProps) {
  const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }])
  const [direction, setDirection] = useState<Direction>("RIGHT")
  const [food, setFood] = useState<Food>({ x: 15, y: 10, type: "normal", points: 10 })
  const [bonusFood, setBonusFood] = useState<Food | null>(null)
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const [highScore, setHighScore] = useState(0)
  const [particles, setParticles] = useState<{ x: number; y: number; id: number }[]>([])
  const [combo, setCombo] = useState(0)
  const [lastEatTime, setLastEatTime] = useState(0)
  const [speedBoost, setSpeedBoost] = useState(false)
  const [slowMode, setSlowMode] = useState(false)
  
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const directionRef = useRef(direction)
  const particleIdRef = useRef(0)

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
      newPos = {
        x: Math.floor(Math.random() * BOARD_SIZE),
        y: Math.floor(Math.random() * BOARD_SIZE)
      }
    } while (snake.some(segment => segment.x === newPos.x && segment.y === newPos.y))
    
    const type = getRandomFoodType()
    return {
      ...newPos,
      type,
      points: FOOD_TYPES[type].points
    }
  }, [snake])

  const spawnBonusFood = useCallback(() => {
    if (Math.random() < 0.15 && !bonusFood) {
      let newPos: Position
      do {
        newPos = {
          x: Math.floor(Math.random() * BOARD_SIZE),
          y: Math.floor(Math.random() * BOARD_SIZE)
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

  const addParticles = useCallback((x: number, y: number) => {
    const newParticles = Array.from({ length: 8 }, () => ({
      x: x * CELL_SIZE + CELL_SIZE / 2,
      y: y * CELL_SIZE + CELL_SIZE / 2,
      id: particleIdRef.current++
    }))
    setParticles(prev => [...prev, ...newParticles])
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)))
    }, 500)
  }, [])

  const moveSnake = useCallback(() => {
    if (!isActive || isPaused || gameOver) return

    setSnake(prevSnake => {
      const head = { ...prevSnake[0] }
      const currentDirection = directionRef.current

      switch (currentDirection) {
        case "UP": head.y -= 1; break
        case "DOWN": head.y += 1; break
        case "LEFT": head.x -= 1; break
        case "RIGHT": head.x += 1; break
      }

      // Check wall collision
      if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
        setGameOver(true)
        onGameEnd(score, moves)
        return prevSnake
      }

      // Check self collision
      if (prevSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
        setGameOver(true)
        onGameEnd(score, moves)
        return prevSnake
      }

      const newSnake = [head, ...prevSnake]
      let ate = false
      let ateBonus = false

      // Check food collision
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
        addParticles(head.x, head.y)
        
        // Handle special food effects
        if (food.type === "speed") {
          setSpeedBoost(true)
          setSpeed(s => Math.max(50, s - 30))
          setTimeout(() => {
            setSpeedBoost(false)
            setSpeed(INITIAL_SPEED - Math.floor(score / 100) * SPEED_INCREASE)
          }, 5000)
        } else if (food.type === "slow") {
          setSlowMode(true)
          setSpeed(s => s + 50)
          setTimeout(() => {
            setSlowMode(false)
            setSpeed(INITIAL_SPEED - Math.floor(score / 100) * SPEED_INCREASE)
          }, 5000)
        }
        
        setFood(generateFood())
        spawnBonusFood()
        
        // Increase speed
        if (newScore % 100 === 0 && speed > 80) {
          setSpeed(s => Math.max(80, s - SPEED_INCREASE))
        }
      }

      // Check bonus food collision
      if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
        ateBonus = true
        const newScore = score + bonusFood.points
        setScore(newScore)
        onScoreUpdate(newScore)
        addParticles(head.x, head.y)
        setBonusFood(null)
      }

      if (!ate && !ateBonus) {
        newSnake.pop()
      }

      return newSnake
    })
  }, [isActive, isPaused, gameOver, food, bonusFood, score, moves, combo, lastEatTime, speed, generateFood, spawnBonusFood, addParticles, onGameEnd, onScoreUpdate])

  // Game loop
  useEffect(() => {
    if (!isActive || isPaused || gameOver) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
      return
    }

    gameLoopRef.current = setInterval(moveSnake, speed)

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    }
  }, [isActive, isPaused, gameOver, speed, moveSnake])

  // Bonus food expiration
  useEffect(() => {
    if (bonusFood && bonusFood.expireAt) {
      const timeout = bonusFood.expireAt - Date.now()
      if (timeout <= 0) {
        setBonusFood(null)
      } else {
        const timer = setTimeout(() => setBonusFood(null), timeout)
        return () => clearTimeout(timer)
      }
    }
  }, [bonusFood])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || gameOver) return

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault()
          if (directionRef.current !== "DOWN") {
            setDirection("UP")
            directionRef.current = "UP"
          }
          break
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault()
          if (directionRef.current !== "UP") {
            setDirection("DOWN")
            directionRef.current = "DOWN"
          }
          break
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault()
          if (directionRef.current !== "RIGHT") {
            setDirection("LEFT")
            directionRef.current = "LEFT"
          }
          break
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault()
          if (directionRef.current !== "LEFT") {
            setDirection("RIGHT")
            directionRef.current = "RIGHT"
          }
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
  }, [isActive, gameOver])

  const resetGame = () => {
    setSnake([{ x: 10, y: 10 }])
    setDirection("RIGHT")
    directionRef.current = "RIGHT"
    setFood(generateFood())
    setBonusFood(null)
    setScore(0)
    setMoves(0)
    setGameOver(false)
    setIsPaused(false)
    setSpeed(INITIAL_SPEED)
    setCombo(0)
    setSpeedBoost(false)
    setSlowMode(false)
  }

  const handleDirection = (dir: Direction) => {
    if (gameOver || isPaused) return
    const opposites: Record<Direction, Direction> = {
      UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT"
    }
    if (directionRef.current !== opposites[dir]) {
      setDirection(dir)
      directionRef.current = dir
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Game Board */}
      <div className="relative bg-gray-900 rounded-lg p-2 border-2 border-gray-700">
        <div 
          className="grid gap-0 relative"
          style={{ 
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`
          }}
        >
          {/* Board grid */}
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, i) => {
            const x = i % BOARD_SIZE
            const y = Math.floor(i / BOARD_SIZE)
            const isSnake = snake.some(s => s.x === x && s.y === y)
            const isHead = snake[0].x === x && snake[0].y === y
            const isFood = food.x === x && food.y === y
            const isBonusFood = bonusFood?.x === x && bonusFood?.y === y
            
            return (
              <div
                key={i}
                className={`
                  transition-all duration-75
                  ${isHead ? "bg-emerald-400 rounded-md shadow-lg shadow-emerald-500/50" : ""}
                  ${isSnake && !isHead ? "bg-emerald-500 rounded-sm" : ""}
                  ${isFood ? `rounded-full animate-pulse` : ""}
                  ${isBonusFood ? "rounded-full animate-bounce" : ""}
                  ${!isSnake && !isFood && !isBonusFood ? "bg-gray-800/50" : ""}
                `}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: isFood 
                    ? FOOD_TYPES[food.type].color 
                    : isBonusFood 
                      ? "#ffd700" 
                      : undefined,
                  boxShadow: isFood || isBonusFood 
                    ? `0 0 10px ${isFood ? FOOD_TYPES[food.type].color : "#ffd700"}` 
                    : undefined
                }}
              />
            )
          })}
          
          {/* Particles */}
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute w-2 h-2 rounded-full bg-yellow-400 animate-ping"
              style={{
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)"
              }}
            />
          ))}
        </div>

        {/* Pause Overlay */}
        {isPaused && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Pause className="h-12 w-12 text-white mx-auto mb-2" />
              <p className="text-white font-bold">PAUSED</p>
              <p className="text-gray-400 text-sm">Press P to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500 mb-2">GAME OVER</p>
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
              className="h-10 w-10"
              onClick={() => handleDirection("UP")}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => handleDirection("LEFT")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => setIsPaused(p => !p)}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => handleDirection("RIGHT")}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10"
              onClick={() => handleDirection("DOWN")}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>
        </Card>

        {/* Food Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Food Types</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-300">Normal +10</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-300">Bonus +25</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-gray-300">Golden +50</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-300">Speed +15</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-gray-300">Slow +15</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
