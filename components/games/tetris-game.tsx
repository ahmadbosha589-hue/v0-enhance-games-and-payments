"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Play, 
  Pause, 
  RotateCw, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  ChevronDown,
  Zap,
  Flame,
  Star,
  Trophy,
  Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const CELL_SIZE = 24

// Multiple color schemes for variety
const COLOR_SCHEMES = [
  { I: "#00f5ff", O: "#ffd700", T: "#a855f7", S: "#22c55e", Z: "#ef4444", J: "#3b82f6", L: "#f97316" },
  { I: "#f472b6", O: "#84cc16", T: "#06b6d4", S: "#fbbf24", Z: "#8b5cf6", J: "#ec4899", L: "#14b8a6" },
  { I: "#fb923c", O: "#a3e635", T: "#e879f9", S: "#38bdf8", Z: "#facc15", J: "#4ade80", L: "#f87171" },
]

const getColorScheme = () => COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)]

const createTetrominos = (colors: typeof COLOR_SCHEMES[0]) => ({
  I: { shape: [[1, 1, 1, 1]], color: colors.I },
  O: { shape: [[1, 1], [1, 1]], color: colors.O },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: colors.T },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: colors.S },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: colors.Z },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: colors.J },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: colors.L },
})

type TetrominoType = keyof ReturnType<typeof createTetrominos>
type Board = (string | null)[][]

interface TetrisGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
}

// Random events to keep gameplay fresh
const RANDOM_EVENTS = [
  { type: "speed_boost", message: "Speed Boost!", duration: 5000, chance: 0.04, icon: Zap },
  { type: "slow_motion", message: "Slow Motion!", duration: 5000, chance: 0.04, icon: Pause },
  { type: "bonus_points", message: "Bonus Points!", points: 100, chance: 0.06, icon: Star },
  { type: "clear_row", message: "Free Row Clear!", chance: 0.02, icon: Sparkles },
  { type: "color_shift", message: "Color Shift!", chance: 0.03, icon: Flame },
  { type: "double_score", message: "2x Score!", duration: 8000, chance: 0.03, icon: Trophy },
]

// Line clear messages for combos
const LINE_CLEAR_MESSAGES = [
  { lines: 1, message: "Single!", color: "text-blue-400", points: 100 },
  { lines: 2, message: "Double!", color: "text-green-400", points: 300 },
  { lines: 3, message: "Triple!", color: "text-yellow-400", points: 500 },
  { lines: 4, message: "TETRIS!", color: "text-red-500", points: 800 },
]

// Achievement badges
const ACHIEVEMENTS = [
  { id: "first_tetris", name: "First Tetris!", condition: (stats: GameStats) => stats.tetrises >= 1 },
  { id: "combo_master", name: "Combo x5!", condition: (stats: GameStats) => stats.maxCombo >= 5 },
  { id: "speed_demon", name: "Level 10!", condition: (stats: GameStats) => stats.level >= 10 },
  { id: "centurion", name: "100 Lines!", condition: (stats: GameStats) => stats.totalLines >= 100 },
]

interface GameStats {
  tetrises: number
  maxCombo: number
  level: number
  totalLines: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  life: number
}

export function TetrisGame({ onGameEnd, onScoreUpdate, isActive }: TetrisGameProps) {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard())
  const [currentPiece, setCurrentPiece] = useState<{
    type: TetrominoType
    shape: number[][]
    x: number
    y: number
  } | null>(null)
  const [nextPieces, setNextPieces] = useState<TetrominoType[]>([])
  const [holdPiece, setHoldPiece] = useState<TetrominoType | null>(null)
  const [canHold, setCanHold] = useState(true)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [moves, setMoves] = useState(0)
  const [activeEvent, setActiveEvent] = useState<{ type: string; message: string; icon: typeof Zap } | null>(null)
  const [lineClearMessage, setLineClearMessage] = useState<{ message: string; color: string } | null>(null)
  const [speedModifier, setSpeedModifier] = useState(1)
  const [scoreMultiplier, setScoreMultiplier] = useState(1)
  const [showGhostPiece, setShowGhostPiece] = useState(true)
  const [combo, setCombo] = useState(0)
  const [lastClearTime, setLastClearTime] = useState(0)
  const [shakeBoard, setShakeBoard] = useState(false)
  const [flashRows, setFlashRows] = useState<number[]>([])
  const [tetrominos, setTetrominos] = useState(() => createTetrominos(getColorScheme()))
  const [particles, setParticles] = useState<Particle[]>([])
  const [stats, setStats] = useState<GameStats>({ tetrises: 0, maxCombo: 0, level: 1, totalLines: 0 })
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([])
  const [showAchievement, setShowAchievement] = useState<string | null>(null)
  const [perfectClear, setPerfectClear] = useState(false)
  
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const eventTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const particleIdRef = useRef(0)

  function createEmptyBoard(): Board {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null))
  }

  const getRandomPiece = useCallback((): TetrominoType => {
    const types = Object.keys(tetrominos) as TetrominoType[]
    return types[Math.floor(Math.random() * types.length)]
  }, [tetrominos])

  // Generate next pieces queue (7-bag randomizer for fairness)
  const fillNextPieces = useCallback(() => {
    if (nextPieces.length < 3) {
      const types = Object.keys(tetrominos) as TetrominoType[]
      const shuffled = [...types].sort(() => Math.random() - 0.5)
      setNextPieces(prev => [...prev, ...shuffled].slice(0, 5))
    }
  }, [nextPieces.length, tetrominos])

  // Spawn particles for visual feedback
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 8) => {
    const newParticles: Particle[] = Array.from({ length: count }, () => ({
      id: particleIdRef.current++,
      x: x * CELL_SIZE + CELL_SIZE / 2,
      y: y * CELL_SIZE + CELL_SIZE / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      color,
      life: 1
    }))
    setParticles(prev => [...prev, ...newParticles])
  }, [])

  // Update particles
  useEffect(() => {
    if (particles.length === 0) return
    const interval = setInterval(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.3,
            life: p.life - 0.03
          }))
          .filter(p => p.life > 0)
      )
    }, 16)
    return () => clearInterval(interval)
  }, [particles.length])

  // Check achievements
  useEffect(() => {
    ACHIEVEMENTS.forEach(achievement => {
      if (!unlockedAchievements.includes(achievement.id) && achievement.condition(stats)) {
        setUnlockedAchievements(prev => [...prev, achievement.id])
        setShowAchievement(achievement.name)
        setTimeout(() => setShowAchievement(null), 3000)
      }
    })
  }, [stats, unlockedAchievements])

  // Hold piece function
  const holdCurrentPiece = useCallback(() => {
    if (!currentPiece || !canHold || isPaused || gameOver) return
    
    const currentType = currentPiece.type
    setCanHold(false)
    
    if (holdPiece) {
      const piece = tetrominos[holdPiece]
      setCurrentPiece({
        type: holdPiece,
        shape: piece.shape.map(row => [...row]),
        x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2),
        y: 0
      })
    } else {
      const type = nextPieces[0] || getRandomPiece()
      const piece = tetrominos[type]
      setCurrentPiece({
        type,
        shape: piece.shape.map(row => [...row]),
        x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2),
        y: 0
      })
      setNextPieces(prev => prev.slice(1))
    }
    
    setHoldPiece(currentType)
    setMoves(m => m + 1)
  }, [currentPiece, canHold, isPaused, gameOver, holdPiece, tetrominos, nextPieces, getRandomPiece])

  // Calculate ghost piece position
  const getGhostPosition = useCallback(() => {
    if (!currentPiece || !showGhostPiece) return null
    let ghostY = currentPiece.y
    while (!checkCollision({ ...currentPiece, y: ghostY + 1 }, board)) {
      ghostY++
    }
    return ghostY
  }, [currentPiece, showGhostPiece, board])

  // Trigger random events
  const triggerRandomEvent = useCallback(() => {
    const roll = Math.random()
    let cumulative = 0
    
    for (const event of RANDOM_EVENTS) {
      cumulative += event.chance
      if (roll < cumulative) {
        setActiveEvent({ type: event.type, message: event.message, icon: event.icon })
        
        if (event.type === "speed_boost") {
          setSpeedModifier(0.5)
          if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
          eventTimeoutRef.current = setTimeout(() => {
            setSpeedModifier(1)
            setActiveEvent(null)
          }, event.duration)
        } else if (event.type === "slow_motion") {
          setSpeedModifier(2)
          if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
          eventTimeoutRef.current = setTimeout(() => {
            setSpeedModifier(1)
            setActiveEvent(null)
          }, event.duration)
        } else if (event.type === "bonus_points") {
          const bonusPoints = (event.points || 100) * scoreMultiplier
          setScore(s => {
            const newScore = s + bonusPoints
            onScoreUpdate(newScore)
            return newScore
          })
          setTimeout(() => setActiveEvent(null), 2000)
        } else if (event.type === "clear_row") {
          setBoard(prevBoard => {
            const newBoard = prevBoard.filter((_, i) => i !== BOARD_HEIGHT - 1)
            newBoard.unshift(Array(BOARD_WIDTH).fill(null))
            return newBoard
          })
          setShakeBoard(true)
          setTimeout(() => setShakeBoard(false), 300)
          setTimeout(() => setActiveEvent(null), 2000)
        } else if (event.type === "color_shift") {
          setTetrominos(createTetrominos(getColorScheme()))
          setTimeout(() => setActiveEvent(null), 2000)
        } else if (event.type === "double_score") {
          setScoreMultiplier(2)
          if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
          eventTimeoutRef.current = setTimeout(() => {
            setScoreMultiplier(1)
            setActiveEvent(null)
          }, event.duration)
        }
        return
      }
    }
  }, [onScoreUpdate, scoreMultiplier])

  const spawnPiece = useCallback(() => {
    fillNextPieces()
    const type = nextPieces[0] || getRandomPiece()
    const piece = tetrominos[type]
    const newPiece = {
      type,
      shape: piece.shape.map(row => [...row]),
      x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2),
      y: 0
    }
    setCurrentPiece(newPiece)
    setNextPieces(prev => prev.slice(1))
    setCanHold(true)
    return newPiece
  }, [nextPieces, getRandomPiece, tetrominos, fillNextPieces])

  const checkCollision = useCallback((piece: typeof currentPiece, boardState: Board): boolean => {
    if (!piece) return true
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x
          const newY = piece.y + y
          if (
            newX < 0 ||
            newX >= BOARD_WIDTH ||
            newY >= BOARD_HEIGHT ||
            (newY >= 0 && boardState[newY][newX])
          ) {
            return true
          }
        }
      }
    }
    return false
  }, [])

  const mergePiece = useCallback((piece: typeof currentPiece, boardState: Board): Board => {
    if (!piece) return boardState
    const newBoard = boardState.map(row => [...row])
    const color = tetrominos[piece.type].color
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x] && piece.y + y >= 0) {
          newBoard[piece.y + y][piece.x + x] = color
        }
      }
    }
    return newBoard
  }, [tetrominos])

  const clearLines = useCallback((boardState: Board): { newBoard: Board; cleared: number; clearedRows: number[] } => {
    const clearedRows: number[] = []
    boardState.forEach((row, i) => {
      if (row.every(cell => cell !== null)) {
        clearedRows.push(i)
      }
    })
    
    const newBoard = boardState.filter((_, i) => !clearedRows.includes(i))
    const cleared = clearedRows.length
    
    while (newBoard.length < BOARD_HEIGHT) {
      newBoard.unshift(Array(BOARD_WIDTH).fill(null))
    }
    
    // Check for perfect clear (empty board)
    const isPerfectClear = newBoard.every(row => row.every(cell => cell === null))
    if (isPerfectClear && cleared > 0) {
      setPerfectClear(true)
      setTimeout(() => setPerfectClear(false), 2000)
    }
    
    if (cleared > 0) {
      // Flash animation for cleared rows
      setFlashRows(clearedRows)
      setTimeout(() => setFlashRows([]), 200)
      
      // Spawn particles for each cleared cell
      clearedRows.forEach(rowIndex => {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          const color = boardState[rowIndex][x]
          if (color) {
            spawnParticles(x, rowIndex, color, 4)
          }
        }
      })
      
      const messageData = LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)]
      setLineClearMessage(messageData)
      setTimeout(() => setLineClearMessage(null), 1500)
      
      // Update stats
      setStats(prev => ({
        ...prev,
        totalLines: prev.totalLines + cleared,
        tetrises: cleared === 4 ? prev.tetrises + 1 : prev.tetrises
      }))
      
      // Combo system
      const now = Date.now()
      if (now - lastClearTime < 3000) {
        setCombo(c => {
          const newCombo = c + 1
          setStats(prev => ({ ...prev, maxCombo: Math.max(prev.maxCombo, newCombo) }))
          return newCombo
        })
      } else {
        setCombo(1)
      }
      setLastClearTime(now)
      
      // Screen shake for tetris
      if (cleared >= 4) {
        setShakeBoard(true)
        setTimeout(() => setShakeBoard(false), 300)
      }
    }
    
    return { newBoard, cleared, clearedRows }
  }, [lastClearTime, spawnParticles])

  const rotatePiece = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    const rotated = currentPiece.shape[0].map((_, i) =>
      currentPiece.shape.map(row => row[i]).reverse()
    )
    const newPiece = { ...currentPiece, shape: rotated }
    
    // Wall kick - try to adjust position if rotation causes collision
    for (const offset of [0, 1, -1, 2, -2]) {
      const testPiece = { ...newPiece, x: newPiece.x + offset }
      if (!checkCollision(testPiece, board)) {
        setCurrentPiece(testPiece)
        setMoves(m => m + 1)
        return
      }
    }
  }, [currentPiece, isPaused, gameOver, board, checkCollision])

  const movePiece = useCallback((dx: number, dy: number) => {
    if (!currentPiece || isPaused || gameOver) return false
    const newPiece = { ...currentPiece, x: currentPiece.x + dx, y: currentPiece.y + dy }
    if (!checkCollision(newPiece, board)) {
      setCurrentPiece(newPiece)
      if (dx !== 0) setMoves(m => m + 1)
      return true
    }
    return false
  }, [currentPiece, isPaused, gameOver, board, checkCollision])

  const hardDrop = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    let newY = currentPiece.y
    while (!checkCollision({ ...currentPiece, y: newY + 1 }, board)) {
      newY++
    }
    const droppedPiece = { ...currentPiece, y: newY }
    const mergedBoard = mergePiece(droppedPiece, board)
    const { newBoard, cleared } = clearLines(mergedBoard)
    
    const dropScore = (newY - currentPiece.y) * 2
    const lineScore = (cleared > 0 ? LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)].points : 0) * level * scoreMultiplier
    const comboBonus = combo > 1 ? combo * 50 : 0
    const perfectClearBonus = perfectClear ? 1000 : 0
    const newScore = score + dropScore + lineScore + comboBonus + perfectClearBonus
    
    setBoard(newBoard)
    setScore(newScore)
    setLines(l => l + cleared)
    setMoves(m => m + 1)
    onScoreUpdate(newScore)
    
    if (cleared > 0 && (lines + cleared) % 10 === 0) {
      const newLevel = Math.min(level + 1, 15)
      setLevel(newLevel)
      setStats(prev => ({ ...prev, level: newLevel }))
    }

    // Spawn new piece
    const newSpawnedPiece = {
      type: nextPieces[0] || getRandomPiece(),
      shape: tetrominos[nextPieces[0] || "I"].shape.map(row => [...row]),
      x: Math.floor((BOARD_WIDTH - tetrominos[nextPieces[0] || "I"].shape[0].length) / 2),
      y: 0
    }
    
    if (checkCollision(newSpawnedPiece, newBoard)) {
      setGameOver(true)
      onGameEnd(newScore, moves + 1)
    } else {
      setCurrentPiece(newSpawnedPiece)
      setNextPieces(prev => prev.slice(1))
      setCanHold(true)
      fillNextPieces()
    }
  }, [currentPiece, isPaused, gameOver, board, checkCollision, mergePiece, clearLines, score, level, lines, moves, nextPieces, getRandomPiece, onScoreUpdate, onGameEnd, tetrominos, fillNextPieces, combo, scoreMultiplier, perfectClear])

  // Game loop
  useEffect(() => {
    if (!isActive || isPaused || gameOver || !currentPiece) return

    const speed = Math.max(100, 1000 - (level - 1) * 100) * speedModifier
    
    // Random event trigger
    if (Math.random() < 0.08) {
      triggerRandomEvent()
    }
    
    gameLoopRef.current = setInterval(() => {
      if (!movePiece(0, 1)) {
        // Piece landed
        const mergedBoard = mergePiece(currentPiece, board)
        const { newBoard, cleared } = clearLines(mergedBoard)
        
        const lineScore = (cleared > 0 ? LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)].points : 0) * level * scoreMultiplier
        const comboBonus = combo > 1 ? combo * 50 : 0
        const newScore = score + lineScore + 10 + comboBonus
        
        setBoard(newBoard)
        setScore(newScore)
        setLines(l => l + cleared)
        onScoreUpdate(newScore)
        
        if (cleared > 0 && (lines + cleared) % 10 === 0) {
          const newLevel = Math.min(level + 1, 15)
          setLevel(newLevel)
          setStats(prev => ({ ...prev, level: newLevel }))
        }

        // Spawn new piece
        const newSpawnedPiece = {
          type: nextPieces[0] || getRandomPiece(),
          shape: tetrominos[nextPieces[0] || "I"].shape.map(row => [...row]),
          x: Math.floor((BOARD_WIDTH - tetrominos[nextPieces[0] || "I"].shape[0].length) / 2),
          y: 0
        }
        
        if (checkCollision(newSpawnedPiece, newBoard)) {
          setGameOver(true)
          onGameEnd(newScore, moves)
        } else {
          setCurrentPiece(newSpawnedPiece)
          setNextPieces(prev => prev.slice(1))
          setCanHold(true)
          fillNextPieces()
        }
      }
    }, speed)

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    }
  }, [isActive, isPaused, gameOver, currentPiece, level, board, score, lines, moves, nextPieces, movePiece, mergePiece, clearLines, checkCollision, getRandomPiece, onScoreUpdate, onGameEnd, speedModifier, tetrominos, fillNextPieces, triggerRandomEvent, combo, scoreMultiplier])

  // Initialize game
  useEffect(() => {
    if (isActive && !currentPiece && !gameOver) {
      fillNextPieces()
      spawnPiece()
    }
  }, [isActive, currentPiece, gameOver, spawnPiece, fillNextPieces])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive || gameOver) return
      
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault()
          movePiece(-1, 0)
          break
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault()
          movePiece(1, 0)
          break
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault()
          movePiece(0, 1)
          break
        case "ArrowUp":
        case "w":
        case "W":
        case "x":
        case "X":
          e.preventDefault()
          rotatePiece()
          break
        case " ":
          e.preventDefault()
          hardDrop()
          break
        case "p":
        case "P":
        case "Escape":
          e.preventDefault()
          setIsPaused(p => !p)
          break
        case "c":
        case "C":
        case "Shift":
          e.preventDefault()
          holdCurrentPiece()
          break
        case "g":
        case "G":
          e.preventDefault()
          setShowGhostPiece(g => !g)
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, gameOver, movePiece, rotatePiece, hardDrop, holdCurrentPiece])

  // Render the board with current piece and ghost piece
  const renderBoard = () => {
    const displayBoard: { color: string | null; isGhost?: boolean; isFlash?: boolean }[][] = board.map((row, rowIndex) => 
      row.map(cell => ({ color: cell, isGhost: false, isFlash: flashRows.includes(rowIndex) }))
    )
    
    // Draw ghost piece first
    const ghostY = getGhostPosition()
    if (currentPiece && ghostY !== null && ghostY !== currentPiece.y) {
      const ghostColor = tetrominos[currentPiece.type].color
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = ghostY + y
            const boardX = currentPiece.x + x
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              displayBoard[boardY][boardX] = { color: ghostColor, isGhost: true }
            }
          }
        }
      }
    }
    
    // Draw current piece
    if (currentPiece) {
      const color = tetrominos[currentPiece.type].color
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPiece.y + y
            const boardX = currentPiece.x + x
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              displayBoard[boardY][boardX] = { color, isGhost: false }
            }
          }
        }
      }
    }

    return displayBoard
  }

  const renderPiecePreview = (type: TetrominoType | null, size: number = 4) => {
    if (!type) return null
    const piece = tetrominos[type]
    return (
      <div className="flex flex-col gap-0.5 items-center justify-center p-1">
        {piece.shape.map((row, y) => (
          <div key={y} className="flex gap-0.5">
            {row.map((cell, x) => (
              <div
                key={x}
                className="rounded-sm transition-all"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: cell ? piece.color : "transparent",
                  boxShadow: cell ? `inset 0 0 ${size/2}px rgba(255,255,255,0.3)` : "none"
                }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const resetGame = () => {
    setBoard(createEmptyBoard())
    setCurrentPiece(null)
    setNextPieces([])
    setHoldPiece(null)
    setCanHold(true)
    setScore(0)
    setLevel(1)
    setLines(0)
    setGameOver(false)
    setIsPaused(false)
    setMoves(0)
    setCombo(0)
    setStats({ tetrises: 0, maxCombo: 0, level: 1, totalLines: 0 })
    setSpeedModifier(1)
    setScoreMultiplier(1)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Game Board */}
      <div 
        ref={boardRef}
        className={cn(
          "relative bg-gray-900 rounded-lg p-2 border-2 border-gray-700 transition-transform",
          shakeBoard && "animate-pulse"
        )}
        style={{ 
          width: BOARD_WIDTH * CELL_SIZE + 16,
          minWidth: BOARD_WIDTH * CELL_SIZE + 16,
          transform: shakeBoard ? `translateX(${Math.random() > 0.5 ? 3 : -3}px)` : "none"
        }}
        tabIndex={0}
      >
        {/* Grid */}
        <div 
          className="grid gap-[1px] relative"
          style={{ 
            gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${CELL_SIZE}px)`
          }}
        >
          {renderBoard().flat().map((cell, i) => (
            <div
              key={i}
              className={cn(
                "rounded-sm transition-all duration-75",
                cell.isGhost && "opacity-30",
                cell.isFlash && "animate-pulse bg-white"
              )}
              style={{
                backgroundColor: cell.isFlash ? "#fff" : (cell.color || "#1a1a2e"),
                boxShadow: cell.color && !cell.isGhost 
                  ? `inset 0 0 6px rgba(255,255,255,0.3), 0 0 2px ${cell.color}` 
                  : "none",
                border: cell.isGhost ? `2px dashed ${cell.color}` : "none"
              }}
            />
          ))}
        </div>

        {/* Particles */}
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: 6,
              height: 6,
              backgroundColor: p.color,
              opacity: p.life,
              transform: "translate(-50%, -50%)",
              boxShadow: `0 0 4px ${p.color}`
            }}
          />
        ))}

        {/* Random Event Notification */}
        {activeEvent && !isPaused && !gameOver && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 rounded-lg shadow-lg animate-bounce z-20 flex items-center gap-2">
            {activeEvent.icon && <activeEvent.icon className="h-4 w-4 text-white" />}
            <p className="text-white font-bold text-sm whitespace-nowrap">{activeEvent.message}</p>
          </div>
        )}

        {/* Line Clear Message */}
        {lineClearMessage && !isPaused && !gameOver && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className={cn("text-3xl font-black drop-shadow-lg animate-pulse", lineClearMessage.color)}>
              {lineClearMessage.message}
            </p>
          </div>
        )}

        {/* Perfect Clear */}
        {perfectClear && !isPaused && !gameOver && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className="text-4xl font-black text-yellow-400 drop-shadow-lg animate-bounce">
              PERFECT CLEAR!
            </p>
          </div>
        )}

        {/* Achievement Notification */}
        {showAchievement && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-2 rounded-lg shadow-lg z-20 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-white" />
            <p className="text-white font-bold text-sm">{showAchievement}</p>
          </div>
        )}

        {/* Score Multiplier Indicator */}
        {scoreMultiplier > 1 && !isPaused && !gameOver && (
          <div className="absolute top-4 right-2 bg-yellow-500 px-2 py-1 rounded-full shadow-lg z-20">
            <p className="text-white font-bold text-xs">{scoreMultiplier}x</p>
          </div>
        )}

        {/* Pause Overlay */}
        {isPaused && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg z-30">
            <div className="text-center">
              <Pause className="h-12 w-12 text-white mx-auto mb-2" />
              <p className="text-white font-bold text-xl">PAUSED</p>
              <p className="text-gray-400 text-sm mt-2">Press P to resume</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg z-30">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500 mb-2">GAME OVER</p>
              <p className="text-white mb-1">Score: {score.toLocaleString()}</p>
              <p className="text-gray-400 text-sm mb-1">Level: {level} | Lines: {lines}</p>
              <p className="text-gray-400 text-sm mb-4">Max Combo: {stats.maxCombo}x</p>
              <Button onClick={resetGame} variant="outline" size="sm">
                <RotateCw className="h-4 w-4 mr-2" />
                Play Again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      <div className="flex flex-col gap-3 min-w-[140px]">
        {/* Stats */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <div className="space-y-2">
            <div>
              <p className="text-gray-400 text-xs">Score</p>
              <p className="text-xl font-bold text-white">{score.toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-gray-400 text-xs">Level</p>
                <p className="font-bold text-lg text-cyan-400">{level}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Lines</p>
                <p className="font-bold text-lg text-green-400">{lines}</p>
              </div>
            </div>
            {combo > 1 && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 rounded px-2 py-1">
                <Flame className="h-4 w-4" />
                <span className="font-bold text-sm">{combo}x Combo!</span>
              </div>
            )}
          </div>
        </Card>

        {/* Hold Piece */}
        <Card className="p-2 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-1 font-medium">Hold (C)</p>
          <div className="h-10 flex items-center justify-center bg-gray-800/50 rounded">
            {holdPiece ? renderPiecePreview(holdPiece, 8) : (
              <p className="text-gray-600 text-xs">Empty</p>
            )}
          </div>
        </Card>

        {/* Next Pieces */}
        <Card className="p-2 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-1 font-medium">Next</p>
          <div className="space-y-1">
            {nextPieces.slice(0, 3).map((type, i) => (
              <div key={i} className={cn(
                "h-8 flex items-center justify-center bg-gray-800/50 rounded",
                i === 0 && "bg-gray-700/50"
              )}>
                {renderPiecePreview(type, i === 0 ? 8 : 6)}
              </div>
            ))}
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-2 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Controls</p>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={rotatePiece}
              disabled={!isActive || gameOver}
            >
              <RotateCw className="h-3 w-3" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => movePiece(-1, 0)}
              disabled={!isActive || gameOver}
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={hardDrop}
              disabled={!isActive || gameOver}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => movePiece(1, 0)}
              disabled={!isActive || gameOver}
            >
              <ArrowRight className="h-3 w-3" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => movePiece(0, 1)}
              disabled={!isActive || gameOver}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <div />
          </div>
          <div className="flex gap-1 mt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 h-7 text-xs"
              onClick={() => setIsPaused(p => !p)}
              disabled={!isActive || gameOver}
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 h-7 text-xs"
              onClick={holdCurrentPiece}
              disabled={!isActive || gameOver || !canHold}
            >
              Hold
            </Button>
          </div>
        </Card>

        {/* Achievements */}
        {unlockedAchievements.length > 0 && (
          <Card className="p-2 bg-gray-900 border-gray-700">
            <p className="text-gray-400 text-xs mb-1 font-medium">Achievements</p>
            <div className="flex flex-wrap gap-1">
              {unlockedAchievements.map(id => (
                <Badge key={id} variant="secondary" className="text-xs">
                  <Trophy className="h-3 w-3 mr-1" />
                  {ACHIEVEMENTS.find(a => a.id === id)?.name}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
