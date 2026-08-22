"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, RotateCcw } from "lucide-react"

const BOARD_SIZE = 10 // Larger board for better gameplay
const CELL_SIZE = 30 // Cell size optimized for the board
const GAP_SIZE = 2 // Gap between cells (2px)
const PADDING = 8 // Container padding (p-2 = 0.5rem = 8px)

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

// Base special block spawn rates - balanced for challenging gameplay
const BASE_SPECIAL_RATES = {
  bomb: 0.008, // Rare but powerful
  rainbow: 0.006, // Very rare
  multiplier: 0.007, // Rare
}

const SPECIAL_BLOCKS = {
  bomb: { chance: BASE_SPECIAL_RATES.bomb, icon: "💣", color: "#374151", name: "Bomb" },
  rainbow: { chance: BASE_SPECIAL_RATES.rainbow, icon: "🌈", color: "rainbow", name: "Rainbow" },
  multiplier: { chance: BASE_SPECIAL_RATES.multiplier, icon: "×2", color: "#fbbf24", name: "Multiplier" },
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
  initialScore?: number
}

export function BlockBlastGame({ onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 200, initialScore = 0 }: BlockBlastGameProps) {
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
  // Minimum seconds to play legitimately — MUST match the server's
  // MIN_GAME_DURATIONS_MS.block_blast (lib/games/game-engine.ts = 12000ms).
  // A mismatch fails legitimate wins with "Game completed too quickly".
  const MIN_GAME_DURATION = 12

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

  // Special block spawn rates scale with difficulty - more specials at low difficulty
  const getSpecialType = useCallback((): SpecialType => {
    // At level 1: 1.5x spawn rate, at level 10: 0.6x spawn rate
    const difficultyMultiplier = Math.max(0.6, 1.5 - (difficultyLevel - 1) * 0.1)
    const roll = Math.random()
    let cumulative = 0
    for (const [type, config] of Object.entries(SPECIAL_BLOCKS)) {
      cumulative += config.chance * difficultyMultiplier
      if (roll < cumulative) return type as SpecialType
    }
    return null
  }, [difficultyLevel])

  // Get number of colors based on difficulty - MORE colors = harder to find matches
  const getColorsForDifficulty = useCallback((palette: string[]): string[] => {
    // Scale colors with difficulty: 7 colors at level 1 (harder start), up to 8 at level 10
    const baseColors = 7 // More colors = harder to find matches
    const extraColors = Math.min(1, Math.floor(difficultyLevel / 5)) // Add 1 color at level 5+
    return palette.slice(0, baseColors + extraColors)
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

    // Clustering scales with difficulty - REDUCED clustering for harder gameplay
    // Level 1: 12% clustering (challenging), Level 10: 3% clustering (very hard)
    const clusterChance = Math.max(0.03, 0.12 - (difficultyLevel - 1) * 0.01)
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        // Cluster blocks near same-colored neighbors (less often = harder)
        if (Math.random() < clusterChance && x > 0) {
          newBoard[y][x].color = newBoard[y][x - 1].color
        } else if (Math.random() < clusterChance * 0.8 && y > 0) { // Even less vertical clustering
          newBoard[y][x].color = newBoard[y - 1][x].color
        }
      }
    }

    setBoard(newBoard)
    setCellIdCounter(id)
    setScore(initialScore)
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
  }, [getColorsForDifficulty, difficultyLevel, initialScore])

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

  // Handle direct powerup click (when clicking a special block that's not part of a group)
  const handlePowerupClick = useCallback(async (x: number, y: number): Promise<boolean> => {
    const cell = board[y]?.[x]
    if (!cell?.special) return false

    const expandedGroup = new Set<string>()
    let bonusPoints = 0

    if (cell.special === "bomb") {
      // Bomb clears 3x3 area around it
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny]?.[nx]?.color) {
            expandedGroup.add(`${nx},${ny}`)
          }
        }
      }
      bonusPoints = 30
      setShakeBoard(true)
      setTimeout(() => setShakeBoard(false), 300)
    } else if (cell.special === "rainbow") {
      // Rainbow clears all blocks of the most common adjacent color
      const adjacentColors: Record<string, number> = {}
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]

      for (const [dx, dy] of directions) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
          const adjCell = board[ny]?.[nx]
          if (adjCell?.color && !adjCell.special) {
            adjacentColors[adjCell.color] = (adjacentColors[adjCell.color] || 0) + 1
          }
        }
      }

      // Find the most common adjacent color, or pick one randomly if none
      let targetColor = Object.entries(adjacentColors).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (!targetColor) {
        // Pick a random color from the board
        const allColors = board.flat().filter(c => c.color && !c.special).map(c => c.color)
        targetColor = allColors[Math.floor(Math.random() * allColors.length)]
      }

      if (targetColor) {
        // Clear all blocks of that color
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row]?.[col]?.color === targetColor) {
              expandedGroup.add(`${col},${row}`)
            }
          }
        }
      }
      expandedGroup.add(`${x},${y}`) // Include the rainbow block itself
      bonusPoints = 50
    } else if (cell.special === "multiplier") {
      // Multiplier activates 2x for 15 seconds and clears itself + adjacent
      expandedGroup.add(`${x},${y}`)
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      for (const [dx, dy] of directions) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny]?.[nx]?.color) {
          expandedGroup.add(`${nx},${ny}`)
        }
      }
      setActiveMultiplier(2)
      setTimeout(() => setActiveMultiplier(1), 15000)
      bonusPoints = 25
    }

    if (expandedGroup.size === 0) return false

    return { expandedGroup, bonusPoints } as unknown as boolean
  }, [board])

  // Handle blast (tap on group of 3+)
  const handleBlast = useCallback(async (x: number, y: number) => {
    if (!isActive || isAnimatingRef.current || gameOver) return

    const cell = board[y]?.[x]
    let group = findConnectedGroup(board, x, y)

    // If group is too small, check if it's a powerup that can be clicked directly
    if (group.size < 3) {
      if (cell?.special) {
        // Handle direct powerup click
        const powerupResult = await (async () => {
          const expandedGroup = new Set<string>()
          let bonusPoints = 0

          if (cell.special === "bomb") {
            // Bomb clears 5x5 area around it for bigger impact
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                // Create circular explosion pattern (skip corners for more natural look)
                if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue
                const nx = x + dx
                const ny = y + dy
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny]?.[nx]?.color) {
                  expandedGroup.add(`${nx},${ny}`)
                }
              }
            }
            bonusPoints = 50 // More bonus for using bomb
            setShakeBoard(true)
            setTimeout(() => setShakeBoard(false), 400)
          } else if (cell.special === "rainbow") {
            // Rainbow clears all blocks of the most common adjacent color
            const adjacentColors: Record<string, number> = {}
            const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]

            for (const [dx, dy] of directions) {
              const nx = x + dx
              const ny = y + dy
              if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                const adjCell = board[ny]?.[nx]
                if (adjCell?.color && !adjCell.special) {
                  adjacentColors[adjCell.color] = (adjacentColors[adjCell.color] || 0) + 1
                }
              }
            }

            // Find the most common adjacent color, or pick one randomly if none
            let targetColor = Object.entries(adjacentColors).sort((a, b) => b[1] - a[1])[0]?.[0]
            if (!targetColor) {
              // Pick a random color from the board
              const allColors = board.flat().filter(c => c.color && !c.special).map(c => c.color)
              targetColor = allColors[Math.floor(Math.random() * allColors.length)]
            }

            if (targetColor) {
              // Clear all blocks of that color
              for (let row = 0; row < BOARD_SIZE; row++) {
                for (let col = 0; col < BOARD_SIZE; col++) {
                  if (board[row]?.[col]?.color === targetColor) {
                    expandedGroup.add(`${col},${row}`)
                  }
                }
              }
            }
            expandedGroup.add(`${x},${y}`) // Include the rainbow block itself
            bonusPoints = 50
          } else if (cell.special === "multiplier") {
            // Multiplier activates 2x for 20 seconds and creates a + pattern clear
            expandedGroup.add(`${x},${y}`)
            // Clear entire row and column for dramatic effect
            for (let i = 0; i < BOARD_SIZE; i++) {
              // Horizontal line
              if (board[y]?.[i]?.color) {
                expandedGroup.add(`${i},${y}`)
              }
              // Vertical line
              if (board[i]?.[x]?.color) {
                expandedGroup.add(`${x},${i}`)
              }
            }
            setActiveMultiplier(2)
            setTimeout(() => setActiveMultiplier(1), 20000) // 20 seconds of 2x
            bonusPoints = 40
          }

          return { expandedGroup, bonusPoints }
        })()

        if (powerupResult.expandedGroup.size === 0) return

        setIsAnimating(true)
        setMoves(m => m + 1)
        setBlastingCells(powerupResult.expandedGroup)

        // Show blast message
        const blastMsg = BLAST_MESSAGES.filter(m => powerupResult.expandedGroup.size >= m.min).pop()
        if (blastMsg) {
          setBlastMessage(blastMsg)
          setTimeout(() => setBlastMessage(null), 1000)
        }

        // Calculate score - 4 points per block for balanced gameplay
        const basePoints = powerupResult.expandedGroup.size * 4
        const totalPoints = Math.floor((basePoints + powerupResult.bonusPoints) * activeMultiplier * scoreMultiplierFromDifficulty)

        const newScore = scoreRef.current + totalPoints
        setScore(newScore)
        onScoreUpdate(newScore)

        // Wait for blast animation
        await new Promise(resolve => setTimeout(resolve, 300))

        // Remove blasted cells and drop
        let idCounter = cellIdCounter
        const newBoard = board.map(row => row.map(c => ({ ...c })))

        powerupResult.expandedGroup.forEach(key => {
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

        await new Promise(resolve => setTimeout(resolve, 200))

        if (!hasValidMoves(newBoard) && !hasEndedRef.current) {
          hasEndedRef.current = true
          setGameOver(true)
          setTimeout(() => onGameEnd(scoreRef.current, movesRef.current), 0)
        }

        setIsAnimating(false)
        return
      }
      return // Not a powerup and group too small
    }

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
      const cellInGroup = board[cellY]?.[cellX]
      if (!cellInGroup) return

      if (cellInGroup.special === "bomb") {
        // Bomb clears 5x5 area (circular pattern)
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue // Skip corners
            const nx = cellX + dx
            const ny = cellY + dy
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              expandedGroup.add(`${nx},${ny}`)
            }
          }
        }
        bonusPoints += 35
        setShakeBoard(true)
        setTimeout(() => setShakeBoard(false), 400)
      } else if (cellInGroup.special === "multiplier") {
        // Multiplier in group: activate 2x and clear cross pattern
        setActiveMultiplier(2)
        setTimeout(() => setActiveMultiplier(1), 20000)
        // Add cross pattern clear
        for (let i = 0; i < BOARD_SIZE; i++) {
          if (board[cellY]?.[i]?.color) expandedGroup.add(`${i},${cellY}`)
          if (board[i]?.[cellX]?.color) expandedGroup.add(`${cellX},${i}`)
        }
        bonusPoints += 25
      } else if (cellInGroup.special === "rainbow") {
        // Rainbow in a group clears all of the group's color
        const groupColor = board[y]?.[x]?.color
        if (groupColor) {
          for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
              if (board[row]?.[col]?.color === groupColor) {
                expandedGroup.add(`${col},${row}`)
              }
            }
          }
        }
        bonusPoints += 30
      }

      if (cellInGroup.glowing) {
        bonusPoints += 3 // Glowing blocks give extra points
      }
    })

    // Show blast message
    const blastMsg = BLAST_MESSAGES.filter(m => expandedGroup.size >= m.min).pop()
    if (blastMsg) {
      setBlastMessage(blastMsg)
      setTimeout(() => setBlastMessage(null), 1000)
    }

    // Calculate score - 4 points per block with bonus for larger groups
    // Points scale slightly with difficulty for balance
    const pointsPerBlock = 4
    const basePoints = expandedGroup.size * pointsPerBlock
    const sizeBonus = expandedGroup.size > 5 ? (expandedGroup.size - 5) * 2 : 0 // Bonus for groups larger than 5
    const comboBonus = expandedGroup.size > 10 ? 10 : 0 // Extra bonus for big combos
    const totalPoints = Math.floor((basePoints + sizeBonus + comboBonus + bonusPoints) * activeMultiplier * scoreMultiplierFromDifficulty)

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
        className={`relative bg-gray-900 rounded-lg p-2 border-2 border-gray-700 transition-transform flex-shrink-0 touch-none select-none ${shakeBoard ? "animate-pulse" : ""}`}
        style={{
          width: boardWidth,
          height: boardHeight,
          transform: shakeBoard ? `translateX(${Math.random() > 0.5 ? 2 : -2}px)` : "none",
        }}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gap: `${GAP_SIZE}px`,
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
                  ${isHighlighted ? "ring-2 ring-white scale-110 z-10 brightness-125" : ""}
                  ${isBlasting ? "scale-0 opacity-0 rotate-180" : "scale-100 opacity-100"}
                  ${!isAnimating && !gameOver && cell.color ? "hover:brightness-110 hover:scale-105 active:scale-95 cursor-pointer" : ""}
                  ${cell.glowing ? "animate-pulse" : ""}
                  ${cell.special === "rainbow" ? "animate-spin-slow" : ""}
                  ${cell.special === "bomb" ? "animate-pulse-fast" : ""}
                  ${cell.special === "multiplier" ? "animate-glow-pulse" : ""}
                  disabled:cursor-not-allowed
                `}
                style={{
                  backgroundColor: cell.special === "rainbow"
                    ? undefined
                    : cell.special === "bomb"
                      ? "#1f1f1f"
                      : cell.special === "multiplier"
                        ? undefined
                        : cell.color || "#1a1a2e",
                  background: cell.special === "rainbow"
                    ? "linear-gradient(45deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff, #ff0088, #ff0000)"
                    : cell.special === "bomb"
                      ? "radial-gradient(circle at 35% 35%, #5a5a5a 0%, #2d2d2d 40%, #1a1a1a 70%, #0a0a0a 100%)"
                      : cell.special === "multiplier"
                        ? "linear-gradient(135deg, #ffd700 0%, #ffb347 20%, #ffd700 40%, #fff68f 60%, #ffd700 80%, #ff8c00 100%)"
                        : cell.color && !cell.special
                          ? `linear-gradient(135deg, ${cell.color} 0%, ${adjustColor(cell.color, -30)} 100%)`
                          : undefined,
                  backgroundSize: cell.special === "rainbow" ? "400% 400%" : cell.special === "multiplier" ? "300% 300%" : undefined,
                  animation: cell.special === "rainbow"
                    ? "rainbowShift 2s ease infinite"
                    : cell.special === "multiplier"
                      ? "shimmer 2s ease-in-out infinite"
                      : cell.special === "bomb"
                        ? "bombPulse 1s ease-in-out infinite"
                        : undefined,
                  boxShadow: cell.special === "rainbow"
                    ? "0 0 15px rgba(255,0,0,0.7), 0 0 25px rgba(255,136,0,0.5), 0 0 35px rgba(0,255,0,0.4), 0 0 45px rgba(0,136,255,0.4), inset 0 0 15px rgba(255,255,255,0.6)"
                    : cell.special === "bomb"
                      ? "0 0 12px rgba(255,80,0,0.8), 0 0 24px rgba(255,40,0,0.5), 0 0 36px rgba(255,0,0,0.3), inset 0 -6px 12px rgba(0,0,0,0.9), inset 0 6px 12px rgba(150,150,150,0.4)"
                      : cell.special === "multiplier"
                        ? "0 0 15px rgba(255,215,0,0.9), 0 0 30px rgba(255,180,0,0.6), 0 0 45px rgba(255,140,0,0.4), inset 0 -4px 10px rgba(0,0,0,0.5), inset 0 4px 10px rgba(255,255,255,0.7)"
                        : cell.color
                          ? `inset 0 -3px 6px rgba(0,0,0,0.4), inset 0 3px 6px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.3)${cell.glowing ? `, 0 0 12px ${cell.color}, 0 0 20px ${cell.color}40` : ""}`
                          : "none",
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  touchAction: "none",
                  WebkitTapHighlightColor: "transparent",
                  border: cell.special === "rainbow"
                    ? "2px solid rgba(255,255,255,0.8)"
                    : cell.special === "bomb"
                      ? "3px solid #ff4500"
                      : cell.special === "multiplier"
                        ? "3px solid #ffd700"
                        : cell.color ? `1px solid ${adjustColor(cell.color, 20)}` : "none",
                  borderRadius: cell.special === "bomb" ? "50%" : cell.special === "multiplier" ? "8px" : undefined,
                }}
              >
                {cell.special && (
                  <span
                    className={`absolute inset-0 flex items-center justify-center font-bold drop-shadow-lg select-none
                      ${cell.special === "bomb" ? "text-lg" : ""}
                      ${cell.special === "rainbow" ? "text-base" : ""}
                      ${cell.special === "multiplier" ? "text-[13px] font-black" : ""}
                    `}
                    style={{
                      textShadow: cell.special === "multiplier"
                        ? "0 0 8px rgba(255,255,255,1), 0 0 16px rgba(255,215,0,0.9), 0 0 24px rgba(255,180,0,0.7), 1px 1px 2px rgba(0,0,0,0.8)"
                        : cell.special === "bomb"
                          ? "0 0 6px rgba(255,120,0,0.9), 0 0 12px rgba(255,60,0,0.7), 0 0 18px rgba(255,0,0,0.5)"
                          : undefined,
                      color: cell.special === "multiplier" ? "#fff" : undefined,
                      fontWeight: cell.special === "multiplier" ? 900 : undefined,
                      letterSpacing: cell.special === "multiplier" ? "-0.5px" : undefined,
                    }}
                  >
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

        {/* Multiplier Indicator - Polished */}
        {activeMultiplier > 1 && !gameOver && (
          <div
            className="absolute top-4 right-4 px-4 py-1.5 rounded-full shadow-xl z-20 animate-pulse"
            style={{
              background: "linear-gradient(135deg, #ffd700 0%, #ff8c00 50%, #ffd700 100%)",
              boxShadow: "0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,140,0,0.5), inset 0 2px 4px rgba(255,255,255,0.5)",
              border: "2px solid rgba(255,255,255,0.6)"
            }}
          >
            <p className="text-white font-black text-base tracking-tight" style={{ textShadow: "0 0 10px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.8)" }}>
              {activeMultiplier}x ACTIVE
            </p>
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
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-base flex-shrink-0"
                style={{
                  background: "radial-gradient(circle at 35% 35%, #5a5a5a 0%, #2d2d2d 40%, #1a1a1a 70%, #0a0a0a 100%)",
                  border: "2px solid #ff4500",
                  boxShadow: "0 0 10px rgba(255,80,0,0.6), inset 0 -3px 6px rgba(0,0,0,0.8)"
                }}
              >
                💣
              </div>
              <div className="flex flex-col">
                <span className="text-gray-300 font-medium">Bomb</span>
                <span className="text-gray-500 text-[10px]">5x5 explosion</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded flex items-center justify-center text-base animate-spin-slow flex-shrink-0"
                style={{
                  background: "linear-gradient(45deg, #ef4444, #eab308, #22c55e, #3b82f6)",
                  border: "2px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 0 10px rgba(255,100,100,0.5)"
                }}
              >
                🌈
              </div>
              <div className="flex flex-col">
                <span className="text-gray-300 font-medium">Rainbow</span>
                <span className="text-gray-500 text-[10px]">Matches any color</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #ffd700 0%, #ffb347 30%, #ffd700 60%, #ff8c00 100%)",
                  border: "2px solid #ffd700",
                  boxShadow: "0 0 12px rgba(255,215,0,0.7), inset 0 2px 4px rgba(255,255,255,0.5)",
                  textShadow: "0 0 6px rgba(255,255,255,0.8), 1px 1px 2px rgba(0,0,0,0.5)"
                }}
              >
                ×2
              </div>
              <div className="flex flex-col">
                <span className="text-gray-300 font-medium">Multiplier</span>
                <span className="text-gray-500 text-[10px]">2x pts + cross clear</span>
              </div>
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
