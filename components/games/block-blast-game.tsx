"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, RotateCcw } from "lucide-react"

const BOARD_SIZE = 8
const CELL_SIZE = 36

// Multiple color palettes for variety
const COLOR_PALETTES = [
  ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316"], // Classic
  ["#f472b6", "#84cc16", "#06b6d4", "#fbbf24", "#8b5cf6", "#ec4899"], // Candy
  ["#fb923c", "#a3e635", "#e879f9", "#38bdf8", "#facc15", "#4ade80"], // Neon
  ["#dc2626", "#16a34a", "#2563eb", "#d97706", "#7c3aed", "#db2777"], // Deep
]

const getRandomPalette = () => COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)]

// Special block types for extra excitement
const SPECIAL_BLOCKS = {
  bomb: { chance: 0.025, color: "#1f2937", effect: "clear_nearby", icon: "B" },
  rainbow: { chance: 0.02, color: "rainbow", effect: "match_any", icon: "R" },
  multiplier: { chance: 0.03, color: "#ffd700", effect: "2x_points", icon: "2x" },
  lightning: { chance: 0.02, color: "#60a5fa", effect: "clear_row", icon: "L" },
  star: { chance: 0.015, color: "#f472b6", effect: "clear_color", icon: "S" },
}

// Achievement messages for big combos
const COMBO_MESSAGES = [
  { min: 2, message: "Nice!", color: "text-blue-400" },
  { min: 4, message: "Great!", color: "text-green-400" },
  { min: 6, message: "Awesome!", color: "text-yellow-400" },
  { min: 8, message: "Amazing!", color: "text-orange-500" },
  { min: 10, message: "INCREDIBLE!", color: "text-red-500" },
]

const COLORS = getRandomPalette()

type SpecialType = "bomb" | "rainbow" | "multiplier" | "lightning" | "star" | null
type Cell = { color: string | null; id: number; special: SpecialType }
type Board = Cell[][]

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface BlockBlastGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number // Score needed to win and get reward
}

export function BlockBlastGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 200 }: BlockBlastGameProps) {
  // Apply difficulty settings
  const difficultyLevel = difficulty?.level || 1
  const scoreMultiplierFromDifficulty = difficulty?.scoreMultiplier || 1

  // Calculate moves based on difficulty (fewer moves at higher difficulty)
  const maxMoves = Math.max(15, 30 - (difficultyLevel - 1) * 2)
  const [hasWon, setHasWon] = useState(false)
  const [board, setBoard] = useState<Board>(() => createBoard())
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [combo, setCombo] = useState(0)
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [matchedCells, setMatchedCells] = useState<Set<string>>(new Set())
  const [movesLeft, setMovesLeft] = useState(maxMoves)
  const [cellIdCounter, setCellIdCounter] = useState(BOARD_SIZE * BOARD_SIZE)
  const [activeMultiplier, setActiveMultiplier] = useState(1)
  const [colors] = useState(() => getRandomPalette())
  const [eventMessage, setEventMessage] = useState<string | null>(null)
  const [comboMessage, setComboMessage] = useState<{ message: string; color: string } | null>(null)
  const [shakeBoard, setShakeBoard] = useState(false)
  const [particles, setParticles] = useState<{ x: number; y: number; color: string; id: number }[]>([])

  // Reset movesLeft when difficulty changes (new game starts)
  useEffect(() => {
    setMovesLeft(maxMoves)
  }, [maxMoves])

  // Auto-win detection - when score reaches threshold, trigger win
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive) {
      setHasWon(true)
      setGameOver(true)
      onGameEnd(score, moves)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, moves, onGameEnd])

  function getSpecialType(): SpecialType {
    const roll = Math.random()
    let cumulative = 0
    for (const [type, config] of Object.entries(SPECIAL_BLOCKS)) {
      cumulative += config.chance
      if (roll < cumulative) return type as SpecialType
    }
    return null
  }

  function createBoard(): Board {
    let id = 0
    const palette = getRandomPalette()
    return Array(BOARD_SIZE).fill(null).map(() =>
      Array(BOARD_SIZE).fill(null).map(() => ({
        color: palette[Math.floor(Math.random() * palette.length)],
        id: id++,
        special: getSpecialType()
      }))
    )
  }

  const findMatches = useCallback((boardState: Board): Set<string> => {
    const matches = new Set<string>()

    // Check horizontal matches
    for (let y = 0; y < BOARD_SIZE; y++) {
      let count = 1
      for (let x = 1; x < BOARD_SIZE; x++) {
        if (boardState[y][x].color === boardState[y][x - 1].color && boardState[y][x].color) {
          count++
        } else {
          if (count >= 3) {
            for (let i = x - count; i < x; i++) {
              matches.add(`${i},${y}`)
            }
          }
          count = 1
        }
      }
      if (count >= 3) {
        for (let i = BOARD_SIZE - count; i < BOARD_SIZE; i++) {
          matches.add(`${i},${y}`)
        }
      }
    }

    // Check vertical matches
    for (let x = 0; x < BOARD_SIZE; x++) {
      let count = 1
      for (let y = 1; y < BOARD_SIZE; y++) {
        if (boardState[y][x].color === boardState[y - 1][x].color && boardState[y][x].color) {
          count++
        } else {
          if (count >= 3) {
            for (let i = y - count; i < y; i++) {
              matches.add(`${x},${i}`)
            }
          }
          count = 1
        }
      }
      if (count >= 3) {
        for (let i = BOARD_SIZE - count; i < BOARD_SIZE; i++) {
          matches.add(`${x},${i}`)
        }
      }
    }

    return matches
  }, [])

  const hasValidMoves = useCallback((boardState: Board): boolean => {
    // Check if any swap would create a match
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        // Try swapping with right neighbor
        if (x < BOARD_SIZE - 1) {
          const testBoard = boardState.map(row => row.map(cell => ({ ...cell })))
          const temp = testBoard[y][x]
          testBoard[y][x] = testBoard[y][x + 1]
          testBoard[y][x + 1] = temp
          if (findMatches(testBoard).size > 0) return true
        }
        // Try swapping with bottom neighbor
        if (y < BOARD_SIZE - 1) {
          const testBoard = boardState.map(row => row.map(cell => ({ ...cell })))
          const temp = testBoard[y][x]
          testBoard[y][x] = testBoard[y + 1][x]
          testBoard[y + 1][x] = temp
          if (findMatches(testBoard).size > 0) return true
        }
      }
    }
    return false
  }, [findMatches])

  const removeMatches = useCallback((boardState: Board, matches: Set<string>, currentIdCounter: number): { newBoard: Board; newIdCounter: number; bonusPoints: number } => {
    const newBoard = boardState.map(row => row.map(cell => ({ ...cell })))
    let idCounter = currentIdCounter
    let bonusPoints = 0

    // Check for special blocks in matches
    matches.forEach(key => {
      const [x, y] = key.split(",").map(Number)
      const cell = newBoard[y][x]

      if (cell.special === "bomb") {
        // Clear surrounding cells (3x3 area)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              matches.add(`${nx},${ny}`)
            }
          }
        }
        bonusPoints += 50
        setEventMessage("Bomb Blast!")
        setShakeBoard(true)
        setTimeout(() => setShakeBoard(false), 300)
        setTimeout(() => setEventMessage(null), 1500)
      } else if (cell.special === "multiplier") {
        setActiveMultiplier(2)
        setTimeout(() => setActiveMultiplier(1), 5000)
        setEventMessage("2x Multiplier!")
        setTimeout(() => setEventMessage(null), 1500)
      } else if (cell.special === "lightning") {
        // Clear entire row
        for (let lx = 0; lx < BOARD_SIZE; lx++) {
          matches.add(`${lx},${y}`)
        }
        bonusPoints += 80
        setEventMessage("Lightning Strike!")
        setShakeBoard(true)
        setTimeout(() => setShakeBoard(false), 300)
        setTimeout(() => setEventMessage(null), 1500)
      } else if (cell.special === "star") {
        // Clear all blocks of the same color
        const targetColor = cell.color
        for (let sy = 0; sy < BOARD_SIZE; sy++) {
          for (let sx = 0; sx < BOARD_SIZE; sx++) {
            if (newBoard[sy][sx].color === targetColor) {
              matches.add(`${sx},${sy}`)
            }
          }
        }
        bonusPoints += 100
        setEventMessage("Color Clear!")
        setTimeout(() => setEventMessage(null), 1500)
      }
    })

    // Remove matched cells
    matches.forEach(key => {
      const [x, y] = key.split(",").map(Number)
      newBoard[y][x] = { color: null, id: -1, special: null }
    })

    // Drop cells down
    for (let x = 0; x < BOARD_SIZE; x++) {
      let writePos = BOARD_SIZE - 1
      for (let y = BOARD_SIZE - 1; y >= 0; y--) {
        if (newBoard[y][x].color !== null) {
          newBoard[writePos][x] = newBoard[y][x]
          if (writePos !== y) {
            newBoard[y][x] = { color: null, id: -1, special: null }
          }
          writePos--
        }
      }
      // Fill empty cells at top with random colors and occasional specials
      for (let y = writePos; y >= 0; y--) {
        newBoard[y][x] = {
          color: colors[Math.floor(Math.random() * colors.length)],
          id: idCounter++,
          special: getSpecialType()
        }
      }
    }

    return { newBoard, newIdCounter: idCounter, bonusPoints }
  }, [colors])

  const processMatches = useCallback(async (boardState: Board, comboCount: number, currentIdCounter: number) => {
    const matches = findMatches(boardState)

    if (matches.size === 0) {
      setCombo(0)
      setIsAnimating(false)

      if (!hasValidMoves(boardState) || movesLeft <= 0) {
        setGameOver(true)
        onGameEnd(score, moves)
      }
      return
    }

    setMatchedCells(matches)
    setIsAnimating(true)

    // Calculate score with multiplier and difficulty bonus
    const difficultyBonus = 1 + (difficultyLevel - 1) * 0.15
    const matchScore = matches.size * 10 * (1 + comboCount * 0.5) * activeMultiplier * scoreMultiplierFromDifficulty * difficultyBonus
    const newScore = score + Math.floor(matchScore)
    setScore(newScore)
    setCombo(comboCount + 1)
    onScoreUpdate(newScore)

    // Show combo message for high combos
    const comboMsg = COMBO_MESSAGES.filter(m => comboCount + 1 >= m.min).pop()
    if (comboMsg && comboCount >= 1) {
      setComboMessage(comboMsg)
      setTimeout(() => setComboMessage(null), 1500)
    }

    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 300))

    // Remove matches and fill
    const { newBoard, newIdCounter, bonusPoints } = removeMatches(boardState, matches, currentIdCounter)

    if (bonusPoints > 0) {
      const bonusScore = newScore + bonusPoints * activeMultiplier
      setScore(bonusScore)
      onScoreUpdate(bonusScore)
    }
    setCellIdCounter(newIdCounter)
    setBoard(newBoard)
    setMatchedCells(new Set())

    // Wait a bit then check for new matches
    await new Promise(resolve => setTimeout(resolve, 200))
    processMatches(newBoard, comboCount + 1, newIdCounter)
  }, [findMatches, hasValidMoves, movesLeft, onGameEnd, onScoreUpdate, removeMatches, score, moves])

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!isActive || isAnimating || gameOver || movesLeft <= 0) return

    if (!selectedCell) {
      setSelectedCell({ x, y })
      return
    }

    // Check if adjacent
    const dx = Math.abs(x - selectedCell.x)
    const dy = Math.abs(y - selectedCell.y)

    if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
      // Swap cells
      const newBoard = board.map(row => row.map(cell => ({ ...cell })))
      const temp = newBoard[y][x]
      newBoard[y][x] = newBoard[selectedCell.y][selectedCell.x]
      newBoard[selectedCell.y][selectedCell.x] = temp

      // Check if swap creates match
      const matches = findMatches(newBoard)
      if (matches.size > 0) {
        setBoard(newBoard)
        setMoves(m => m + 1)
        setMovesLeft(m => m - 1)
        setSelectedCell(null)

        // Process matches
        setTimeout(() => {
          processMatches(newBoard, 0, cellIdCounter)
        }, 100)
      } else {
        // Invalid swap - swap back
        setSelectedCell(null)
      }
    } else {
      // Select new cell
      setSelectedCell({ x, y })
    }
  }, [isActive, isAnimating, gameOver, movesLeft, selectedCell, board, findMatches, processMatches, cellIdCounter])

  // Initial match check
  useEffect(() => {
    if (isActive && !gameOver) {
      const matches = findMatches(board)
      if (matches.size > 0) {
        processMatches(board, 0, cellIdCounter)
      }
    }
  }, [isActive]) // Only run on initial activation

  const resetGame = () => {
    setHasWon(false)
    const newBoard = createBoard()
    setBoard(newBoard)
    setScore(0)
    setMoves(0)
    setCombo(0)
    setMovesLeft(maxMoves)
    setSelectedCell(null)
    setMatchedCells(new Set())
    setGameOver(false)
    setCellIdCounter(BOARD_SIZE * BOARD_SIZE)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Board */}
      <div
        className={`relative bg-gray-900 rounded-lg p-3 border-2 border-gray-700 transition-transform overflow-hidden flex-shrink-0 ${shakeBoard ? "animate-pulse" : ""}`}
        style={{
          width: BOARD_SIZE * CELL_SIZE + 24,
          height: BOARD_SIZE * CELL_SIZE + 24,
          maxWidth: "100%",
          transform: shakeBoard ? `translateX(${Math.random() > 0.5 ? 2 : -2}px)` : "none"
        }}
      >
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`
          }}
        >
          {board.flat().map((cell, i) => {
            const x = i % BOARD_SIZE
            const y = Math.floor(i / BOARD_SIZE)
            const isSelected = selectedCell?.x === x && selectedCell?.y === y
            const isMatched = matchedCells.has(`${x},${y}`)

            return (
              <button
                key={cell.id}
                onClick={() => handleCellClick(x, y)}
                disabled={!isActive || isAnimating || gameOver}
                className={`
                  rounded-lg transition-all duration-200 relative
                  ${isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110 z-10" : ""}
                  ${isMatched ? "scale-0 opacity-0" : "scale-100 opacity-100"}
                  ${!isAnimating && !gameOver ? "hover:scale-105 hover:brightness-110 cursor-pointer" : ""}
                  ${cell.special === "bomb" ? "animate-pulse" : ""}
                  ${cell.special === "rainbow" ? "animate-pulse bg-gradient-to-br from-red-500 via-yellow-500 to-blue-500" : ""}
                  ${cell.special === "multiplier" ? "ring-2 ring-yellow-400" : ""}
                  ${cell.special === "lightning" ? "ring-2 ring-blue-400 animate-pulse" : ""}
                  ${cell.special === "star" ? "ring-2 ring-pink-400 animate-pulse" : ""}
                  disabled:cursor-not-allowed
                `}
                style={{
                  backgroundColor: cell.special === "rainbow" ? undefined : (cell.special === "bomb" ? "#374151" : cell.color || "#1a1a2e"),
                  boxShadow: cell.color
                    ? `inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 3px 6px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.3)`
                    : "none",
                  width: CELL_SIZE,
                  height: CELL_SIZE
                }}
              />
            )
          })}
        </div>

        {/* Event Message */}
        {eventMessage && !gameOver && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 rounded-lg shadow-lg animate-bounce z-20">
            <p className="text-white font-bold text-sm whitespace-nowrap">{eventMessage}</p>
          </div>
        )}

        {/* Combo Message */}
        {comboMessage && !gameOver && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <p className={`text-3xl font-black ${comboMessage.color} drop-shadow-lg animate-pulse`}>
              {comboMessage.message}
            </p>
          </div>
        )}

        {/* Multiplier Indicator */}
        {activeMultiplier > 1 && !gameOver && (
          <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-1 rounded-full shadow-lg z-20">
            <p className="text-white font-bold text-sm">{activeMultiplier}x</p>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500 mb-2">GAME OVER</p>
              <p className="text-white mb-4">Final Score: {score.toLocaleString()}</p>
              <Button onClick={resetGame} variant="outline">
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
                <p className="text-gray-400 text-xs">Moves Left</p>
                <p className={`font-bold text-lg ${movesLeft <= 5 ? "text-red-400" : "text-green-400"}`}>
                  {movesLeft}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Moves Made</p>
                <p className="font-bold text-lg text-blue-400">{moves}</p>
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

        {/* How to Play */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">How to Play</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Tap a block to select it</li>
            <li>Tap an adjacent block to swap</li>
            <li>Match 3+ same colors</li>
            <li>Build combos for bonus points</li>
            <li>Clear as many as you can!</li>
          </ul>
        </Card>

        {/* Difficulty */}
        {difficultyLevel > 1 && (
          <Card className="p-3 bg-gray-900 border-gray-700">
            <p className="text-gray-400 text-xs mb-2">Difficulty Level</p>
            <div className="flex gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-4 rounded ${i < difficultyLevel
                    ? difficultyLevel <= 3 ? "bg-green-500" : difficultyLevel <= 6 ? "bg-yellow-500" : "bg-red-500"
                    : "bg-gray-700"
                    }`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {difficultyLevel <= 3 ? "Easy" : difficultyLevel <= 6 ? "Medium" : "Hard"} - {maxMoves} moves
            </p>
          </Card>
        )}

        {/* Progress */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2">Target: 500 points</p>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-green-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (score / 500) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {score >= 500 ? "Target reached!" : `${500 - score} more to go`}
          </p>
        </Card>
      </div>
    </div>
  )
}
