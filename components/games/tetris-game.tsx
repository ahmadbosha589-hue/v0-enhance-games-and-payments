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
  Flame,
  Trophy
} from "lucide-react"
import { cn } from "@/lib/utils"

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const CELL_SIZE = 20

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

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface TetrisGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number
}

const LINE_CLEAR_MESSAGES = [
  { lines: 1, message: "Single!", color: "text-blue-400", points: 100 },
  { lines: 2, message: "Double!", color: "text-green-400", points: 300 },
  { lines: 3, message: "Triple!", color: "text-yellow-400", points: 500 },
  { lines: 4, message: "TETRIS!", color: "text-red-500", points: 800 },
]

export function TetrisGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 300 }: TetrisGameProps) {
  const difficultyLevel = difficulty?.level || 1
  const scoreMultiplierFromDifficulty = difficulty?.scoreMultiplier || 1
  const speedMultiplierFromDifficulty = difficulty?.speedMultiplier || 1

  const [hasWon, setHasWon] = useState(false)
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
  const [gameStarted, setGameStarted] = useState(false)
  const [moves, setMoves] = useState(0)
  const [lineClearMessage, setLineClearMessage] = useState<{ message: string; color: string } | null>(null)
  const [combo, setCombo] = useState(0)
  const [lastClearTime, setLastClearTime] = useState(0)
  const [tetrominos, setTetrominos] = useState(() => createTetrominos(getColorScheme()))
  const [showGhostPiece, setShowGhostPiece] = useState(true)

  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef(score)
  const gameOverRef = useRef(gameOver)
  const isPausedRef = useRef(isPaused)
  const movesRef = useRef(moves)
  const hasEndedRef = useRef(false)

  useEffect(() => {
    scoreRef.current = score
    gameOverRef.current = gameOver
    isPausedRef.current = isPaused
    movesRef.current = moves
  }, [score, gameOver, isPaused, moves])

  function createEmptyBoard(): Board {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null))
  }

  const getRandomPiece = useCallback((): TetrominoType => {
    const types = Object.keys(tetrominos) as TetrominoType[]
    return types[Math.floor(Math.random() * types.length)]
  }, [tetrominos])

  const fillNextPieces = useCallback(() => {
    setNextPieces(prev => {
      if (prev.length < 3) {
        const types = Object.keys(tetrominos) as TetrominoType[]
        const shuffled = [...types].sort(() => Math.random() - 0.5)
        return [...prev, ...shuffled].slice(0, 5)
      }
      return prev
    })
  }, [tetrominos])

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
            (newY >= 0 && boardState[newY]?.[newX])
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
        if (piece.shape[y][x]) {
          const boardY = piece.y + y
          const boardX = piece.x + x
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            newBoard[boardY][boardX] = color
          }
        }
      }
    }
    return newBoard
  }, [tetrominos])

  const clearLines = useCallback((boardState: Board): { newBoard: Board; cleared: number } => {
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

    if (cleared > 0) {
      const messageData = LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)]
      setLineClearMessage(messageData)
      setTimeout(() => setLineClearMessage(null), 1500)

      const now = Date.now()
      if (now - lastClearTime < 3000) {
        setCombo(c => c + 1)
      } else {
        setCombo(1)
      }
      setLastClearTime(now)
    }

    return { newBoard, cleared }
  }, [lastClearTime])

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

  const getGhostPosition = useCallback(() => {
    if (!currentPiece || !showGhostPiece) return null
    let ghostY = currentPiece.y
    while (!checkCollision({ ...currentPiece, y: ghostY + 1 }, board)) {
      ghostY++
    }
    return ghostY
  }, [currentPiece, showGhostPiece, board, checkCollision])

  const rotatePiece = useCallback(() => {
    if (!currentPiece || isPausedRef.current || gameOverRef.current) return
    const rotated = currentPiece.shape[0].map((_, i) =>
      currentPiece.shape.map(row => row[i]).reverse()
    )
    const newPiece = { ...currentPiece, shape: rotated }

    // Wall kick
    for (const offset of [0, 1, -1, 2, -2]) {
      const testPiece = { ...newPiece, x: newPiece.x + offset }
      if (!checkCollision(testPiece, board)) {
        setCurrentPiece(testPiece)
        setMoves(m => m + 1)
        return
      }
    }
  }, [currentPiece, board, checkCollision])

  const movePiece = useCallback((dx: number, dy: number) => {
    if (!currentPiece || isPausedRef.current || gameOverRef.current) return false
    const newPiece = { ...currentPiece, x: currentPiece.x + dx, y: currentPiece.y + dy }
    if (!checkCollision(newPiece, board)) {
      setCurrentPiece(newPiece)
      if (dx !== 0) setMoves(m => m + 1)
      return true
    }
    return false
  }, [currentPiece, board, checkCollision])

  const hardDrop = useCallback(() => {
    if (!currentPiece || isPausedRef.current || gameOverRef.current) return
    let newY = currentPiece.y
    while (!checkCollision({ ...currentPiece, y: newY + 1 }, board)) {
      newY++
    }
    const droppedPiece = { ...currentPiece, y: newY }
    const mergedBoard = mergePiece(droppedPiece, board)
    const { newBoard, cleared } = clearLines(mergedBoard)

    const dropScore = (newY - currentPiece.y) * 2
    const lineScore = (cleared > 0 ? LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)].points : 0) * level * scoreMultiplierFromDifficulty
    const comboBonus = combo > 1 ? combo * 50 : 0
    const newScore = scoreRef.current + dropScore + lineScore + comboBonus

    setBoard(newBoard)
    setScore(newScore)
    setLines(l => l + cleared)
    setMoves(m => m + 1)
    onScoreUpdate(newScore)

    if (cleared > 0 && (lines + cleared) % 10 === 0) {
      const newLevel = Math.min(level + 1, 15)
      setLevel(newLevel)
    }

    // Spawn new piece
    const type = nextPieces[0] || getRandomPiece()
    const piece = tetrominos[type]
    const newSpawnedPiece = {
      type,
      shape: piece.shape.map(row => [...row]),
      x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2),
      y: 0
    }

    if (checkCollision(newSpawnedPiece, newBoard)) {
      if (!hasEndedRef.current) {
        hasEndedRef.current = true
        setGameOver(true)
        setTimeout(() => onGameEnd(newScore, movesRef.current + 1), 0)
      }
    } else {
      setCurrentPiece(newSpawnedPiece)
      setNextPieces(prev => prev.slice(1))
      setCanHold(true)
      fillNextPieces()
    }
  }, [currentPiece, board, checkCollision, mergePiece, clearLines, level, lines, nextPieces, getRandomPiece, onScoreUpdate, onGameEnd, tetrominos, fillNextPieces, combo, scoreMultiplierFromDifficulty])

  const holdCurrentPiece = useCallback(() => {
    if (!currentPiece || !canHold || isPausedRef.current || gameOverRef.current) return

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
  }, [currentPiece, canHold, holdPiece, tetrominos, nextPieces, getRandomPiece])

  // Auto-win detection
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive && gameStarted) {
      setHasWon(true)
      setGameOver(true)
      onGameEnd(score, moves)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, gameStarted, moves, onGameEnd])

  // Initialize game
  useEffect(() => {
    if (isActive && !gameStarted) {
      setBoard(createEmptyBoard())
      setTetrominos(createTetrominos(getColorScheme()))
      fillNextPieces()
      setGameStarted(true)
    }
  }, [isActive, gameStarted, fillNextPieces])

  // Spawn first piece
  useEffect(() => {
    if (isActive && gameStarted && !currentPiece && !gameOver && nextPieces.length > 0) {
      spawnPiece()
    }
  }, [isActive, gameStarted, currentPiece, gameOver, nextPieces.length, spawnPiece])

  // Game loop
  useEffect(() => {
    if (!isActive || isPaused || gameOver || !currentPiece || !gameStarted) return

    const speed = Math.max(100, 1000 - (level - 1) * 100 - (difficultyLevel - 1) * 50) / speedMultiplierFromDifficulty

    gameLoopRef.current = setInterval(() => {
      if (!movePiece(0, 1)) {
        // Piece landed
        const mergedBoard = mergePiece(currentPiece, board)
        const { newBoard, cleared } = clearLines(mergedBoard)

        const lineScore = (cleared > 0 ? LINE_CLEAR_MESSAGES[Math.min(cleared - 1, 3)].points : 0) * level * scoreMultiplierFromDifficulty
        const comboBonus = combo > 1 ? combo * 50 : 0
        const difficultyBonus = (difficultyLevel - 1) * 5
        const newScore = scoreRef.current + lineScore + 10 + comboBonus + difficultyBonus

        setBoard(newBoard)
        setScore(newScore)
        setLines(l => l + cleared)
        onScoreUpdate(newScore)

        if (cleared > 0 && (lines + cleared) % 10 === 0) {
          const newLevel = Math.min(level + 1, 15)
          setLevel(newLevel)
        }

        // Spawn new piece
        const type = nextPieces[0] || getRandomPiece()
        const piece = tetrominos[type]
        const newSpawnedPiece = {
          type,
          shape: piece.shape.map(row => [...row]),
          x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2),
          y: 0
        }

        if (checkCollision(newSpawnedPiece, newBoard)) {
          if (!hasEndedRef.current) {
            hasEndedRef.current = true
            setGameOver(true)
            setTimeout(() => onGameEnd(newScore, movesRef.current), 0)
          }
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
  }, [isActive, isPaused, gameOver, currentPiece, gameStarted, level, board, lines, moves, nextPieces, movePiece, mergePiece, clearLines, checkCollision, getRandomPiece, onScoreUpdate, onGameEnd, tetrominos, fillNextPieces, combo, difficultyLevel, speedMultiplierFromDifficulty])

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
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, gameOver, movePiece, rotatePiece, hardDrop, holdCurrentPiece])

  // Touch controls
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastMoveRef = useRef<number>(0)

  useEffect(() => {
    const boardEl = boardRef.current
    if (!boardEl) return

    const handleTouchStart = (e: TouchEvent) => {
      if (!isActive || gameOver || isPaused) return
      e.preventDefault()
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive || gameOver || isPaused || !touchStartRef.current) return
      e.preventDefault()

      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const now = Date.now()

      if (now - lastMoveRef.current < 100) return

      const moveThreshold = 30

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > moveThreshold) {
        if (dx > 0) {
          movePiece(1, 0)
        } else {
          movePiece(-1, 0)
        }
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
        lastMoveRef.current = now
      } else if (dy > moveThreshold) {
        movePiece(0, 1)
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now }
        lastMoveRef.current = now
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isActive || gameOver || isPaused || !touchStartRef.current) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const dt = Date.now() - touchStartRef.current.time

      // Quick tap = rotate
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 250) {
        rotatePiece()
        touchStartRef.current = null
        return
      }

      // Fast swipe down = hard drop
      if (dy > 80 && dt < 400) {
        hardDrop()
        touchStartRef.current = null
        return
      }

      touchStartRef.current = null
    }

    boardEl.addEventListener("touchstart", handleTouchStart, { passive: false })
    boardEl.addEventListener("touchmove", handleTouchMove, { passive: false })
    boardEl.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      boardEl.removeEventListener("touchstart", handleTouchStart)
      boardEl.removeEventListener("touchmove", handleTouchMove)
      boardEl.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isActive, gameOver, isPaused, movePiece, rotatePiece, hardDrop])

  // Render the board with current piece and ghost piece
  const renderBoard = () => {
    const displayBoard: { color: string | null; isGhost?: boolean }[][] = board.map(row =>
      row.map(cell => ({ color: cell, isGhost: false }))
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
                  boxShadow: cell ? `inset 0 0 ${size / 2}px rgba(255,255,255,0.3)` : "none"
                }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const resetGame = () => {
    setHasWon(false)
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
    setGameStarted(false)
    setTetrominos(createTetrominos(getColorScheme()))
    hasEndedRef.current = false
  }

  const boardWidth = BOARD_WIDTH * CELL_SIZE + BOARD_WIDTH + 20
  const boardHeight = BOARD_HEIGHT * CELL_SIZE + BOARD_HEIGHT + 20

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Board */}
      <div
        ref={boardRef}
        className={cn(
          "touch-none select-none flex-shrink-0",
          "relative bg-gray-900 rounded-lg p-2 border-2 border-gray-700 transition-transform"
        )}
        style={{
          width: boardWidth,
          height: boardHeight,
          maxWidth: "100%",
          overflow: "hidden"
        }}
        tabIndex={0}
      >
        {/* Grid */}
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${CELL_SIZE}px)`,
            width: BOARD_WIDTH * CELL_SIZE + BOARD_WIDTH,
            height: BOARD_HEIGHT * CELL_SIZE + BOARD_HEIGHT,
            gap: "1px"
          }}
        >
          {renderBoard().flat().map((cell, i) => (
            <div
              key={i}
              className={cn(
                "rounded-sm transition-all duration-75",
                cell.isGhost && "opacity-30"
              )}
              style={{
                backgroundColor: cell.color || "#1a1a2e",
                boxShadow: cell.color && !cell.isGhost
                  ? `inset 0 0 6px rgba(255,255,255,0.3), 0 0 2px ${cell.color}`
                  : "none",
                border: cell.isGhost ? `2px dashed ${cell.color}` : "none",
                width: CELL_SIZE,
                height: CELL_SIZE
              }}
            />
          ))}
        </div>

        {/* Line Clear Message */}
        {lineClearMessage && !isPaused && !gameOver && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className={cn("text-2xl font-black drop-shadow-lg animate-pulse", lineClearMessage.color)}>
              {lineClearMessage.message}
            </p>
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

        {/* Start Overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg z-30">
            <div className="text-center">
              <p className="text-white font-bold text-xl mb-2">Tetris</p>
              <p className="text-gray-300 text-sm">Loading...</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg z-30">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500 mb-2">{hasWon ? "YOU WIN!" : "GAME OVER"}</p>
              <p className="text-white mb-1">Score: {score.toLocaleString()}</p>
              <p className="text-gray-400 text-sm mb-4">Level: {level} | Lines: {lines}</p>
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
            <div>
              <p className="text-gray-400 text-xs">Target</p>
              <p className="text-lg font-bold text-green-400">{winThreshold.toLocaleString()}</p>
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

        {/* Difficulty Indicator */}
        {difficultyLevel > 1 && (
          <Card className="p-2 bg-gray-900 border-gray-700">
            <p className="text-gray-400 text-xs mb-1 font-medium">Difficulty</p>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-3 rounded-sm ${i < difficultyLevel
                    ? difficultyLevel <= 3 ? "bg-green-500" : difficultyLevel <= 6 ? "bg-yellow-500" : "bg-red-500"
                    : "bg-gray-700"
                    }`}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
