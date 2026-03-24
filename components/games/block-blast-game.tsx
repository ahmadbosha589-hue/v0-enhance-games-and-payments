"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, RotateCcw } from "lucide-react"

const BOARD_SIZE = 10 // Larger board for better gameplay
const CELL_SIZE = 32 // Cell size optimized for the board
const GAP_SIZE = 2 // Gap between cells (gap-0.5 = 0.125rem = 2px)
const PADDING = 12 // Container padding (p-3 = 0.75rem = 12px)

// Multiple color palettes - 8 colors ensures variety and prevents single-color dominance
const COLOR_PALETTES = [
  ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"],
  ["#f472b6", "#84cc16", "#06b6d4", "#fbbf24", "#8b5cf6", "#ef4444", "#22c55e", "#f97316"],
  ["#fb923c", "#a3e635", "#e879f9", "#38bdf8", "#facc15", "#dc2626", "#a855f7", "#22c55e"],
  ["#dc2626", "#16a34a", "#2563eb", "#d97706", "#7c3aed", "#f472b6", "#06b6d4", "#fbbf24"],
]

const getRandomPalette = () => COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)]

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '')
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount))
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount))
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// Special block types
const SPECIAL_BLOCKS = {
  bomb: { chance: 0.02, icon: "B", color: "#374151" },
  rainbow: { chance: 0.015, icon: "R", color: "rainbow" },
  multiplier: { chance: 0.02, icon: "2x", color: "#fbbf24" },
}

// Achievement messages for big blasts
const BLAST_MESSAGES = [
  { min: 3, message: "Nice!", color: "text-blue-400" },
  { min: 5, message: "Great!", color: "text-green-400" },
  { min: 8, message: "Awesome!", color: "text-yellow-400" },
  { min: 12, message: "Amazing!", color: "text-orange-500" },
  { min: 16, message: "INCREDIBLE!", color: "text-red-500" },
]

type SpecialType = "bomb" | "rainbow" | "multiplier" | null
type Cell = { color: string; id: number; special: SpecialType; glowing?: boolean }
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
  winThreshold?: number
}

export function BlockBlastGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 200 }: BlockBlastGameProps) {
  const difficultyLevel = difficulty?.level || 1
  const scoreMultiplierFromDifficulty = difficulty?.scoreMultiplier || 1

  const [hasWon, setHasWon] = useState(false)
  const [board, setBoard] = useState<Board>(() => [])
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set())
  const [blastingCells, setBlastingCells] = useState<Set<string>>(new Set())
  const [cellIdCounter, setCellIdCounter] = useState(0)
  const [activeMultiplier, setActiveMultiplier] = useState(1)
  const [colors, setColors] = useState<string[]>([])
  const [blastMessage, setBlastMessage] = useState<{ message: string; color: string } | null>(null)
  const [shakeBoard, setShakeBoard] = useState(false)
  const [gameStartTime, setGameStartTime] = useState<number>(0)
  const [tooQuickWarning, setTooQuickWarning] = useState(false)
  const MIN_GAME_DURATION = 20 // Minimum seconds to play legitimately

  const boardRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef(score)
  const isAnimatingRef = useRef(isAnimating)
  const movesRef = useRef(moves)
  const hasEndedRef = useRef(false)

  useEffect(() => {
    scoreRef.current = score
    isAnimatingRef.current = isAnimating
    movesRef.current = moves
  }, [score, isAnimating, moves])

  function getSpecialType(): SpecialType {
    const roll = Math.random()
    let cumulative = 0
    for (const [type, config] of Object.entries(SPECIAL_BLOCKS)) {
      cumulative += config.chance
      if (roll < cumulative) return type as SpecialType
    }
    return null
  }

  // Get number of colors based on difficulty - MORE colors = harder to find matches, prevents single color dominance
  const getColorsForDifficulty = useCallback((palette: string[]): string[] => {
    // Level 1-2: 6 colors, Level 3-4: 7 colors, Level 5+: 8 colors
    // More colors ensures no single color dominates the board
    const numColors = difficultyLevel <= 2 ? 6 : difficultyLevel <= 4 ? 7 : 8
    return palette.slice(0, numColors)
  }, [difficultyLevel])

  // Initialize game with guaranteed groups of 3+
  const initializeGame = useCallback(() => {
    const palette = getRandomPalette()
    const gameColors = getColorsForDifficulty(palette)
    setColors(gameColors)
    let id = 0

    // Create board with clustering to ensure groups exist - use difficulty-adjusted colors
    const newBoard: Board = Array(BOARD_SIZE).fill(null).map(() =>
      Array(BOARD_SIZE).fill(null).map(() => ({
        color: gameColors[Math.floor(Math.random() * gameColors.length)],
        id: id++,
        special: getSpecialType(),
        glowing: Math.random() < 0.05 // 5% chance for glowing blocks (higher score)
      }))
    )

    // Reduce clustering significantly to prevent single-color dominance - lower chance = more variety
    const clusterChance = difficultyLevel <= 2 ? 0.08 : difficultyLevel <= 4 ? 0.05 : 0.03
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        // Only cluster very occasionally and randomly pick which direction
        if (Math.random() < clusterChance && x > 0 && Math.random() < 0.3) {
          newBoard[y][x].color = newBoard[y][x - 1].color
        } else if (Math.random() < clusterChance && y > 0 && Math.random() < 0.3) {
          newBoard[y][x].color = newBoard[y - 1][x].color
        }
      }
    }

    setBoard(newBoard)
    setCellIdCounter(id)
    setScore(0)
    setMoves(0)
    setGameOver(false)
    setHasWon(false)
    setActiveMultiplier(1)
    setGameStarted(true)
    setIsAnimating(false)
    setHighlightedCells(new Set())
    setBlastingCells(new Set())
    setGameStartTime(Date.now())
    setTooQuickWarning(false)
    hasEndedRef.current = false
  }, [getColorsForDifficulty, difficultyLevel])

  // Start game when active
  useEffect(() => {
    if (isActive && !gameStarted) {
      initializeGame()
    }
  }, [isActive, gameStarted, initializeGame])

  // Auto-win detection with anti-cheat timing check
  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive && gameStarted && !hasEndedRef.current) {
      const gameDuration = (Date.now() - gameStartTime) / 1000

      // Check if game was completed too quickly (anti-cheat)
      if (gameDuration < MIN_GAME_DURATION) {
        setTooQuickWarning(true)
        // Don't award win - force them to play longer
        return
      }

      hasEndedRef.current = true
      setHasWon(true)
      setGameOver(true)
      setTimeout(() => onGameEnd(score, moves), 0)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, gameStarted, moves, onGameEnd, gameStartTime])

  // Find connected cells of the same color using flood fill
  const findConnectedGroup = useCallback((boardState: Board, startX: number, startY: number): Set<string> => {
    const group = new Set<string>()
    const targetColor = boardState[startY]?.[startX]?.color
    if (!targetColor) return group

    const visited = new Set<string>()
    const queue: [number, number][] = [[startX, startY]]

    while (queue.length > 0) {
      const [x, y] = queue.shift()!
      const key = `${x},${y}`

      if (visited.has(key)) continue
      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) continue

      const cell = boardState[y]?.[x]
      if (!cell) continue

      // Rainbow blocks match any color
      const matches = cell.color === targetColor || cell.special === "rainbow"
      if (!matches) continue

      visited.add(key)
      group.add(key)

      // Check all 4 directions
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }

    return group
  }, [])

  // Check if there are any valid moves (groups of 3+)
  const hasValidMoves = useCallback((boardState: Board): boolean => {
    const checked = new Set<string>()

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const key = `${x},${y}`
        if (checked.has(key)) continue
        if (!boardState[y]?.[x]?.color) continue

        const group = findConnectedGroup(boardState, x, y)
        if (group.size >= 3) return true

        group.forEach(k => checked.add(k))
      }
    }
    return false
  }, [findConnectedGroup])

  // Handle hover to show potential blast group
  const handleCellHover = useCallback((x: number, y: number) => {
    if (!isActive || isAnimatingRef.current || gameOver) {
      setHighlightedCells(new Set())
      return
    }

    const group = findConnectedGroup(board, x, y)
    if (group.size >= 3) {
      setHighlightedCells(group)
    } else {
      setHighlightedCells(new Set())
    }
  }, [isActive, gameOver, board, findConnectedGroup])

  const handleMouseLeave = useCallback(() => {
    setHighlightedCells(new Set())
  }, [])

  // Handle blast (tap on group of 3+)
  const handleBlast = useCallback(async (x: number, y: number) => {
    if (!isActive || isAnimatingRef.current || gameOver) return

    const group = findConnectedGroup(board, x, y)
    if (group.size < 3) return // Need at least 3 to blast

    setIsAnimating(true)
    setMoves(m => m + 1)
    setBlastingCells(group)

    // Check for special effects
    let bonusPoints = 0
    let expandedGroup = new Set(group)

    group.forEach(key => {
      const [xStr, yStr] = key.split(",")
      const cellX = parseInt(xStr)
      const cellY = parseInt(yStr)
      const cell = board[cellY]?.[cellX]
      if (!cell) return

      if (cell.special === "bomb") {
        // Bomb clears 3x3 area
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cellX + dx
            const ny = cellY + dy
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              expandedGroup.add(`${nx},${ny}`)
            }
          }
        }
        bonusPoints += 20
        setShakeBoard(true)
        setTimeout(() => setShakeBoard(false), 300)
      } else if (cell.special === "multiplier") {
        setActiveMultiplier(2)
        setTimeout(() => setActiveMultiplier(1), 10000)
      }

      if (cell.glowing) {
        bonusPoints += 5 // Glowing blocks give extra points
      }
    })

    // Show blast message
    const blastMsg = BLAST_MESSAGES.filter(m => expandedGroup.size >= m.min).pop()
    if (blastMsg) {
      setBlastMessage(blastMsg)
      setTimeout(() => setBlastMessage(null), 1000)
    }

    // Calculate score - balanced scoring: 3 points per block with combo bonuses
    const basePoints = expandedGroup.size * 3 // 3 points per block
    const sizeBonus = expandedGroup.size > 6 ? (expandedGroup.size - 6) * 2 : 0 // Bonus for larger groups
    const difficultyBonus = 0 // No difficulty bonus
    const totalPoints = Math.floor((basePoints + sizeBonus + bonusPoints + difficultyBonus) * activeMultiplier * scoreMultiplierFromDifficulty)

    const newScore = scoreRef.current + totalPoints
    setScore(newScore)
    onScoreUpdate(newScore)

    // Wait for blast animation
    await new Promise(resolve => setTimeout(resolve, 300))

    // Remove blasted cells
    let idCounter = cellIdCounter
    const newBoard = board.map(row => row.map(cell => ({ ...cell })))

    expandedGroup.forEach(key => {
      const [xStr, yStr] = key.split(",")
      const cellX = parseInt(xStr)
      const cellY = parseInt(yStr)
      if (newBoard[cellY]?.[cellX]) {
        newBoard[cellY][cellX] = { color: "", id: -1, special: null }
      }
    })

    // Drop cells down
    for (let colX = 0; colX < BOARD_SIZE; colX++) {
      let writePos = BOARD_SIZE - 1
      for (let rowY = BOARD_SIZE - 1; rowY >= 0; rowY--) {
        if (newBoard[rowY]?.[colX]?.color) {
          if (writePos !== rowY) {
            newBoard[writePos][colX] = newBoard[rowY][colX]
            newBoard[rowY][colX] = { color: "", id: -1, special: null }
          }
          writePos--
        }
      }
      // Fill empty cells at top
      for (let rowY = writePos; rowY >= 0; rowY--) {
        newBoard[rowY][colX] = {
          color: colors[Math.floor(Math.random() * colors.length)],
          id: idCounter++,
          special: getSpecialType(),
          glowing: Math.random() < 0.05
        }
      }
    }

    setCellIdCounter(idCounter)
    setBoard(newBoard)
    setBlastingCells(new Set())
    setHighlightedCells(new Set())

    // Wait a bit then check for game over
    await new Promise(resolve => setTimeout(resolve, 200))

    if (!hasValidMoves(newBoard) && !hasEndedRef.current) {
      hasEndedRef.current = true
      setGameOver(true)
      setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
    }

    setIsAnimating(false)
  }, [isActive, gameOver, board, findConnectedGroup, colors, cellIdCounter, activeMultiplier, difficultyLevel, scoreMultiplierFromDifficulty, hasValidMoves, onGameEnd, onScoreUpdate])

  const resetGame = useCallback(() => {
    initializeGame()
  }, [initializeGame])

  // Calculate exact board dimensions: cells + gaps + padding
  const boardWidth = (BOARD_SIZE * CELL_SIZE) + ((BOARD_SIZE - 1) * GAP_SIZE) + (PADDING * 2)
  const boardHeight = (BOARD_SIZE * CELL_SIZE) + ((BOARD_SIZE - 1) * GAP_SIZE) + (PADDING * 2)

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Board */}
      <div
        ref={boardRef}
        className={`relative bg-gray-900 rounded-lg p-3 border-2 border-gray-700 transition-transform flex-shrink-0 touch-none select-none ${shakeBoard ? "animate-pulse" : ""}`}
        style={{
          width: boardWidth,
          height: boardHeight,
          maxWidth: "100%",
          transform: shakeBoard ? `translateX(${Math.random() > 0.5 ? 2 : -2}px)` : "none",
          overflow: "hidden"
        }}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            width: (BOARD_SIZE * CELL_SIZE) + ((BOARD_SIZE - 1) * GAP_SIZE),
            height: (BOARD_SIZE * CELL_SIZE) + ((BOARD_SIZE - 1) * GAP_SIZE)
          }}
        >
          {board.flat().map((cell, i) => {
            const x = i % BOARD_SIZE
            const y = Math.floor(i / BOARD_SIZE)
            const key = `${x},${y}`
            const isHighlighted = highlightedCells.has(key)
            const isBlasting = blastingCells.has(key)

            return (
              <button
                key={`${cell.id}-${x}-${y}`}
                onClick={() => handleBlast(x, y)}
                onMouseEnter={() => handleCellHover(x, y)}
                onTouchStart={(e) => {
                  e.preventDefault()
                  handleBlast(x, y)
                }}
                disabled={!isActive || isAnimating || gameOver || !cell.color}
                className={`
                  rounded-md transition-all duration-150 relative touch-none
                  ${isHighlighted ? "ring-2 ring-white scale-105 z-10 brightness-125" : ""}
                  ${isBlasting ? "scale-0 opacity-0" : "scale-100 opacity-100"}
                  ${!isAnimating && !gameOver && cell.color ? "hover:brightness-110 active:scale-95 cursor-pointer" : ""}
                  ${cell.glowing ? "animate-pulse" : ""}
                  disabled:cursor-not-allowed
                `}
                style={{
                  backgroundColor: cell.special === "rainbow"
                    ? undefined
                    : cell.special === "bomb"
                      ? "#374151"
                      : cell.special === "multiplier"
                        ? "#fbbf24"
                        : cell.color || "#1a1a2e",
                  background: cell.special === "rainbow"
                    ? "linear-gradient(45deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)"
                    : cell.color && !cell.special
                      ? `linear-gradient(135deg, ${cell.color} 0%, ${adjustColor(cell.color, -30)} 100%)`
                      : undefined,
                  boxShadow: cell.color
                    ? `inset 0 -3px 6px rgba(0,0,0,0.4), inset 0 3px 6px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.3)${cell.glowing ? `, 0 0 12px ${cell.color}, 0 0 20px ${cell.color}40` : ""}`
                    : "none",
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  touchAction: "none",
                  WebkitTapHighlightColor: "transparent",
                  border: cell.color ? `1px solid ${adjustColor(cell.color, 20)}` : "none"
                }}
              >
                {cell.special && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow-md">
                    {SPECIAL_BLOCKS[cell.special]?.icon}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Blast Message */}
        {blastMessage && !gameOver && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <p className={`text-3xl font-black ${blastMessage.color} drop-shadow-lg animate-bounce`}>
              {blastMessage.message}
            </p>
          </div>
        )}

        {/* Multiplier Indicator */}
        {activeMultiplier > 1 && !gameOver && (
          <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-1 rounded-full shadow-lg z-20">
            <p className="text-white font-bold text-sm">{activeMultiplier}x</p>
          </div>
        )}

        {/* Start Overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className="text-white font-bold text-xl mb-2">Block Blast</p>
              <p className="text-gray-300 text-sm">Loading...</p>
            </div>
          </div>
        )}

        {/* Too Quick Warning Overlay */}
        {tooQuickWarning && !gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg z-30">
            <div className="text-center p-4">
              <p className="text-xl font-bold mb-2 text-yellow-500">Too Quick!</p>
              <p className="text-white text-sm mb-2">
                Game completed in {Math.floor((Date.now() - gameStartTime) / 1000)}s
              </p>
              <p className="text-gray-300 text-sm mb-4">
                Please play legitimately. Min time: {MIN_GAME_DURATION}s
              </p>
              <Button onClick={() => setTooQuickWarning(false)} variant="outline" size="sm">
                Continue Playing
              </Button>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className={`text-2xl font-bold mb-2 ${hasWon ? "text-green-500" : "text-red-500"}`}>{hasWon ? "YOU WIN!" : "NO MOVES LEFT"}</p>
              <p className="text-white mb-4">Final Score: {score.toLocaleString()}</p>
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
              <p className="text-lg font-bold text-green-400">{winThreshold.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Moves</p>
              <p className="font-bold text-lg text-cyan-400">{moves}</p>
            </div>
            {activeMultiplier > 1 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <Sparkles className="h-4 w-4" />
                <span className="font-bold">{activeMultiplier}x Active!</span>
              </div>
            )}
          </div>
        </Card>

        {/* How to Play */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">How to Play</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Tap groups of 3+ same-colored blocks to blast them</li>
            <li>Larger groups = more points</li>
            <li>Glowing blocks give bonus points</li>
            <li>Special blocks have unique effects</li>
          </ul>
        </Card>

        {/* Special Blocks Legend */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Special Blocks</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gray-600 flex items-center justify-center text-white font-bold text-[10px]">B</div>
              <span className="text-gray-400">Bomb - Clears 3x3 area</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px]" style={{ background: "linear-gradient(45deg, #ef4444, #eab308, #22c55e, #3b82f6)" }}>R</div>
              <span className="text-gray-400">Rainbow - Matches any color</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-yellow-500 flex items-center justify-center text-white font-bold text-[10px]">2x</div>
              <span className="text-gray-400">Multiplier - Double points</span>
            </div>
          </div>
        </Card>

        {/* Reset Button */}
        <Button onClick={resetGame} variant="outline" className="w-full" disabled={isAnimating}>
          <RotateCcw className="h-4 w-4 mr-2" />
          New Game
        </Button>
      </div>
    </div>
  )
}
