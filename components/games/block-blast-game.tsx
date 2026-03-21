"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, RotateCcw } from "lucide-react"

const BOARD_COLS = 8
const BOARD_ROWS = 8
const CELL_SIZE = 36

const COLOR_PALETTES = [
  ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316"],
  ["#f472b6", "#84cc16", "#06b6d4", "#fbbf24", "#8b5cf6", "#ec4899"],
  ["#fb923c", "#a3e635", "#e879f9", "#38bdf8", "#facc15", "#4ade80"],
  ["#dc2626", "#16a34a", "#2563eb", "#d97706", "#7c3aed", "#db2777"],
]

const SPECIAL_BLOCKS = {
  bomb: { chance: 0.025, effect: "clear_nearby" },
  rainbow: { chance: 0.02, effect: "match_any" },
  multiplier: { chance: 0.03, effect: "2x_points" },
  lightning: { chance: 0.02, effect: "clear_row" },
  star: { chance: 0.015, effect: "clear_color" },
}

const COMBO_MESSAGES = [
  { min: 2, message: "Nice!", color: "text-blue-400" },
  { min: 4, message: "Great!", color: "text-green-400" },
  { min: 6, message: "Awesome!", color: "text-yellow-400" },
  { min: 8, message: "Amazing!", color: "text-orange-500" },
  { min: 10, message: "INCREDIBLE!", color: "text-red-500" },
]

type SpecialType = "bomb" | "rainbow" | "multiplier" | "lightning" | "star" | null
type Cell = { color: string; id: number; special: SpecialType }
type Board = (Cell | null)[][]

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

// ─── helpers ──────────────────────────────────────────────────────────────────

function getSpecialType(): SpecialType {
  const roll = Math.random()
  let cum = 0
  for (const [type, cfg] of Object.entries(SPECIAL_BLOCKS)) {
    cum += cfg.chance
    if (roll < cum) return type as SpecialType
  }
  return null
}

/** Flood-fill: all cells connected to (sx,sy) with the same color. */
function floodFill(board: Board, sx: number, sy: number): Array<{ x: number; y: number }> {
  const target = board[sy]?.[sx]?.color
  if (!target) return []
  const visited = new Set<string>()
  const group: Array<{ x: number; y: number }> = []
  const stack = [{ x: sx, y: sy }]
  while (stack.length) {
    const { x, y } = stack.pop()!
    const key = `${x},${y}`
    if (visited.has(key)) continue
    if (x < 0 || x >= BOARD_COLS || y < 0 || y >= BOARD_ROWS) continue
    if (board[y]?.[x]?.color !== target) continue
    visited.add(key)
    group.push({ x, y })
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 })
  }
  return group
}

/**
 * Expand a set of cells to remove by applying special-block effects.
 * Also returns bonus points and side effects (multiplier, shake, messages).
 */
function expandSpecials(
  board: Board,
  baseKeys: Set<string>,
  setEventMessage: (m: string | null) => void,
  setActiveMultiplier: (v: number) => void,
  setShakeBoard: (v: boolean) => void,
): { expandedKeys: Set<string>; bonusPoints: number } {
  const expanded = new Set(baseKeys)
  let bonus = 0

  baseKeys.forEach(key => {
    const [x, y] = key.split(",").map(Number)
    const cell = board[y]?.[x]
    if (!cell?.special) return

    if (cell.special === "bomb") {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < BOARD_COLS && ny >= 0 && ny < BOARD_ROWS)
            expanded.add(`${nx},${ny}`)
        }
      bonus += 50
      setEventMessage("💣 Bomb Blast!")
      setShakeBoard(true)
      setTimeout(() => setShakeBoard(false), 300)
      setTimeout(() => setEventMessage(null), 1500)

    } else if (cell.special === "multiplier") {
      setActiveMultiplier(2)
      setTimeout(() => setActiveMultiplier(1), 5000)
      setEventMessage("⚡ 2× Multiplier!")
      setTimeout(() => setEventMessage(null), 1500)

    } else if (cell.special === "lightning") {
      for (let lx = 0; lx < BOARD_COLS; lx++) expanded.add(`${lx},${y}`)
      bonus += 80
      setEventMessage("⚡ Lightning Strike!")
      setShakeBoard(true)
      setTimeout(() => setShakeBoard(false), 300)
      setTimeout(() => setEventMessage(null), 1500)

    } else if (cell.special === "star") {
      const targetColor = cell.color
      for (let sy2 = 0; sy2 < BOARD_ROWS; sy2++)
        for (let sx2 = 0; sx2 < BOARD_COLS; sx2++)
          if (board[sy2]?.[sx2]?.color === targetColor) expanded.add(`${sx2},${sy2}`)
      bonus += 100
      setEventMessage("⭐ Color Clear!")
      setTimeout(() => setEventMessage(null), 1500)

    } else if (cell.special === "rainbow") {
      // Rainbow matches any color — its whole connected group is already included
      bonus += 30
      setEventMessage("🌈 Rainbow!")
      setTimeout(() => setEventMessage(null), 1500)
    }
  })

  return { expandedKeys: expanded, bonusPoints: bonus }
}

/** Drop non-null cells down, fill gaps from top with new random blocks. */
function dropAndFill(
  board: Board, pal: string[], idCtr: number
): { newBoard: Board; newIdCounter: number } {
  const nb: Board = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null))
  let ctr = idCtr
  for (let x = 0; x < BOARD_COLS; x++) {
    const col: Cell[] = []
    for (let y = BOARD_ROWS - 1; y >= 0; y--)
      if (board[y][x]) col.push(board[y][x]!)
    for (let i = 0; i < col.length; i++) nb[BOARD_ROWS - 1 - i][x] = col[i]
    for (let y = BOARD_ROWS - 1 - col.length; y >= 0; y--)
      nb[y][x] = { color: pal[Math.floor(Math.random() * pal.length)], id: ctr++, special: getSpecialType() }
  }
  return { newBoard: nb, newIdCounter: ctr }
}

/** True if any connected group of 3+ same-color cells exists. */
function hasBlastableGroup(board: Board): boolean {
  const visited = new Set<string>()
  for (let y = 0; y < BOARD_ROWS; y++)
    for (let x = 0; x < BOARD_COLS; x++) {
      if (!board[y][x]) continue
      const key = `${x},${y}`
      if (visited.has(key)) continue
      const g = floodFill(board, x, y)
      g.forEach(p => visited.add(`${p.x},${p.y}`))
      if (g.length >= 3) return true
    }
  return false
}

/**
 * Generate a clean starting board with NO pre-existing blastable groups.
 * This prevents auto-blasting on game start.
 */
function buildCleanBoard(pal: string[]): { board: Board; idCounter: number } {
  for (let attempt = 0; attempt < 300; attempt++) {
    let id = 0
    const board: Board = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => ({
        color: pal[Math.floor(Math.random() * pal.length)],
        id: id++,
        special: getSpecialType(),
      }))
    )
    if (!hasBlastableGroup(board)) return { board, idCounter: id }
  }
  // Fallback (very rare with 6 colors)
  let id = 0
  return {
    board: Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => ({
        color: pal[Math.floor(Math.random() * pal.length)],
        id: id++,
        special: getSpecialType(),
      }))
    ),
    idCounter: id,
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export function BlockBlastGame({
  onGameEnd, onScoreUpdate, isActive, difficulty, winThreshold = 200
}: BlockBlastGameProps) {
  const difficultyLevel = difficulty?.level || 1
  const scoreMultiplierFromDiff = difficulty?.scoreMultiplier || 1
  const maxMoves = Math.max(15, 30 - (difficultyLevel - 1) * 2)

  const [hasWon, setHasWon] = useState(false)
  const [board, setBoard] = useState<Board>([])
  const [palette, setPalette] = useState<string[]>([])
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [movesLeft, setMovesLeft] = useState(maxMoves)
  const [combo, setCombo] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [idCounter, setIdCounter] = useState(0)
  const [activeMultiplier, setActiveMultiplier] = useState(1)
  const [eventMessage, setEventMessage] = useState<string | null>(null)
  const [shakeBoard, setShakeBoard] = useState(false)
  // group highlighted (first tap) / blasting (second tap)
  const [selectedGroup, setSelectedGroup] = useState<Set<string>>(new Set())
  const [blastingCells, setBlastingCells] = useState<Set<string>>(new Set())
  const [comboMessage, setComboMessage] = useState<{ message: string; color: string } | null>(null)

  const scoreRef = useRef(0)
  const isAnimatingRef = useRef(false)
  const activeMultRef = useRef(1)
  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { isAnimatingRef.current = isAnimating }, [isAnimating])
  useEffect(() => { activeMultRef.current = activeMultiplier }, [activeMultiplier])

  // ── init ──────────────────────────────────────────────────────────────────

  const initializeGame = useCallback(() => {
    const pal = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)]
    const { board: b, idCounter: id } = buildCleanBoard(pal)
    setPalette(pal)
    setBoard(b)
    setIdCounter(id)
    setScore(0)
    setMoves(0)
    setMovesLeft(maxMoves)
    setCombo(0)
    setGameOver(false)
    setHasWon(false)
    setIsAnimating(false)
    setActiveMultiplier(1)
    setEventMessage(null)
    setShakeBoard(false)
    setSelectedGroup(new Set())
    setBlastingCells(new Set())
    setGameStarted(true)
  }, [maxMoves])

  useEffect(() => {
    if (isActive && !gameStarted) initializeGame()
  }, [isActive, gameStarted, initializeGame])

  // ── win detection ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (score >= winThreshold && !hasWon && !gameOver && isActive && gameStarted) {
      setHasWon(true)
      setGameOver(true)
      onGameEnd(score, moves)
    }
  }, [score, winThreshold, hasWon, gameOver, isActive, gameStarted, moves, onGameEnd])

  // ── cascade: auto-blast groups formed by falling blocks ───────────────────

  const cascade = useCallback(async (
    currentBoard: Board,
    currentIdCtr: number,
    comboCount: number,
    currentPalette: string[],
    currentMoves: number,
    currentMovesLeft: number,
  ) => {
    // Find the largest blastable group
    const visited = new Set<string>()
    let biggest: Array<{ x: number; y: number }> = []
    for (let y = 0; y < BOARD_ROWS; y++)
      for (let x = 0; x < BOARD_COLS; x++) {
        if (!currentBoard[y][x]) continue
        const key = `${x},${y}`
        if (visited.has(key)) continue
        const g = floodFill(currentBoard, x, y)
        g.forEach(p => visited.add(`${p.x},${p.y}`))
        if (g.length >= 3 && g.length > biggest.length) biggest = g
      }

    if (biggest.length === 0) {
      setIsAnimating(false)
      setCombo(0)
      if (currentMovesLeft <= 0) {
        setGameOver(true)
        onGameEnd(scoreRef.current, currentMoves)
      }
      return
    }

    const baseKeys = new Set(biggest.map(p => `${p.x},${p.y}`))
    const { expandedKeys, bonusPoints } = expandSpecials(
      currentBoard, baseKeys, setEventMessage, setActiveMultiplier, setShakeBoard
    )

    setBlastingCells(expandedKeys)
    await new Promise(r => setTimeout(r, 300))

    const diffBonus = 1 + (difficultyLevel - 1) * 0.15
    const pts = Math.floor(
      (biggest.length * 15 * (1 + comboCount * 0.6) + bonusPoints)
      * activeMultRef.current * scoreMultiplierFromDiff * diffBonus
    )
    const newScore = scoreRef.current + pts
    setScore(newScore)
    onScoreUpdate(newScore)

    const newCombo = comboCount + 1
    setCombo(newCombo)
    const msg = COMBO_MESSAGES.filter(m => newCombo >= m.min).pop()
    if (msg && newCombo >= 2) {
      setComboMessage(msg)
      setTimeout(() => setComboMessage(null), 1200)
    }

    const afterBlast: Board = currentBoard.map(row => [...row])
    expandedKeys.forEach(key => {
      const [x, y] = key.split(",").map(Number)
      afterBlast[y][x] = null
    })

    const { newBoard, newIdCounter } = dropAndFill(afterBlast, currentPalette, currentIdCtr)
    setBlastingCells(new Set())
    setBoard(newBoard)
    setIdCounter(newIdCounter)

    await new Promise(r => setTimeout(r, 180))
    cascade(newBoard, newIdCounter, newCombo, currentPalette, currentMoves, currentMovesLeft)
  }, [difficultyLevel, scoreMultiplierFromDiff, onScoreUpdate, onGameEnd])

  // ── cell click ────────────────────────────────────────────────────────────

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!isActive || isAnimatingRef.current || gameOver || movesLeft <= 0) return
    if (!board[y]?.[x]) return

    const key = `${x},${y}`

    if (selectedGroup.has(key)) {
      // ── BLAST the selected group ──
      const group = Array.from(selectedGroup).map(k => {
        const [gx, gy] = k.split(",").map(Number)
        return { x: gx, y: gy }
      })

      const baseKeys = new Set(selectedGroup)
      const { expandedKeys, bonusPoints } = expandSpecials(
        board, baseKeys, setEventMessage, setActiveMultiplier, setShakeBoard
      )

      setSelectedGroup(new Set())
      setIsAnimating(true)
      setBlastingCells(expandedKeys)

      const newMoves = moves + 1
      const newMovesLeft = movesLeft - 1
      setMoves(newMoves)
      setMovesLeft(newMovesLeft)

      setTimeout(async () => {
        const diffBonus = 1 + (difficultyLevel - 1) * 0.15
        const pts = Math.floor(
          (group.length * 10 + bonusPoints)
          * activeMultRef.current * scoreMultiplierFromDiff * diffBonus
        )
        const newScore = scoreRef.current + pts
        setScore(newScore)
        onScoreUpdate(newScore)

        const afterBlast: Board = board.map(row => [...row])
        expandedKeys.forEach(k => {
          const [ex, ey] = k.split(",").map(Number)
          afterBlast[ey][ex] = null
        })

        await new Promise(r => setTimeout(r, 300))
        setBlastingCells(new Set())

        const { newBoard, newIdCounter } = dropAndFill(afterBlast, palette, idCounter)
        setBoard(newBoard)
        setIdCounter(newIdCounter)

        await new Promise(r => setTimeout(r, 180))
        cascade(newBoard, newIdCounter, 1, palette, newMoves, newMovesLeft)
      }, 50)

      return
    }

    // ── HIGHLIGHT group (first tap) ──
    // Rainbow blocks can join any adjacent group — treat them as wildcard
    let group = floodFill(board, x, y)

    // If this cell is rainbow, expand to include adjacent non-matching colors too
    if (board[y][x]?.special === "rainbow" && group.length < 3) {
      // Include all cells adjacent to rainbow cells
      const rainbowAdj = new Set<string>()
      group.forEach(({ x: rx, y: ry }) => {
        ;[{ x: rx + 1, y: ry }, { x: rx - 1, y: ry }, { x: rx, y: ry + 1 }, { x: rx, y: ry - 1 }]
          .filter(p => p.x >= 0 && p.x < BOARD_COLS && p.y >= 0 && p.y < BOARD_ROWS && board[p.y][p.x])
          .forEach(p => rainbowAdj.add(`${p.x},${p.y}`))
      })
      rainbowAdj.forEach(k => {
        const [ax, ay] = k.split(",").map(Number)
        const ext = floodFill(board, ax, ay)
        ext.forEach(p => { if (!group.some(g => g.x === p.x && g.y === p.y)) group.push(p) })
      })
    }

    if (group.length >= 3) {
      setSelectedGroup(new Set(group.map(p => `${p.x},${p.y}`)))
    } else {
      setSelectedGroup(new Set())
    }
  }, [
    isActive, gameOver, movesLeft, board, selectedGroup,
    palette, idCounter, moves, difficultyLevel, scoreMultiplierFromDiff,
    onScoreUpdate, cascade,
  ])

  const handleTouch = useCallback((e: React.TouchEvent, x: number, y: number) => {
    e.preventDefault(); e.stopPropagation(); handleCellClick(x, y)
  }, [handleCellClick])

  const handleMouse = useCallback((e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault(); handleCellClick(x, y)
  }, [handleCellClick])

  const resetGame = useCallback(() => { initializeGame() }, [initializeGame])

  const BOARD_W = BOARD_COLS * CELL_SIZE
  const BOARD_H = BOARD_ROWS * CELL_SIZE

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">

      {/* Game Board */}
      <div
        className={`relative bg-gray-900 rounded-lg p-1.5 border-2 border-gray-700 flex-shrink-0 touch-none select-none overflow-hidden ${shakeBoard ? "animate-pulse" : ""}`}
        style={{
          width: BOARD_W + 12,
          maxWidth: "100%",
          transform: shakeBoard ? `translateX(${Math.random() > 0.5 ? 3 : -3}px)` : "none",
        }}
      >
        <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
          {board.map((row, y) =>
            row.map((cell, x) => {
              if (!cell) return null
              const key = `${x},${y}`
              const isHighlighted = selectedGroup.has(key)
              const isBlasting = blastingCells.has(key)
              const isRainbow = cell.special === "rainbow"

              return (
                <button
                  key={cell.id}
                  onClick={e => handleMouse(e, x, y)}
                  onTouchStart={e => handleTouch(e, x, y)}
                  disabled={!isActive || isAnimating || gameOver}
                  className={[
                    "absolute rounded-md transition-all duration-150 touch-none disabled:cursor-not-allowed",
                    isRainbow ? "animate-pulse" : "",
                    cell.special === "bomb" ? "animate-pulse" : "",
                    cell.special === "lightning" ? "ring-2 ring-blue-400 animate-pulse" : "",
                    cell.special === "multiplier" ? "ring-2 ring-yellow-400" : "",
                    cell.special === "star" ? "ring-2 ring-pink-400 animate-pulse" : "",
                  ].join(" ")}
                  style={{
                    left: x * CELL_SIZE + 1,
                    top: y * CELL_SIZE + 1,
                    width: CELL_SIZE - 2,
                    height: CELL_SIZE - 2,
                    background: isRainbow
                      ? "linear-gradient(135deg,#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#a855f7)"
                      : cell.special === "bomb" ? "#374151" : cell.color,
                    boxShadow: isHighlighted
                      ? `0 0 0 3px white, 0 0 14px ${cell.color}, inset 0 2px 4px rgba(255,255,255,0.5)`
                      : `inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 3px 6px rgba(255,255,255,0.25)`,
                    transform: isBlasting
                      ? "scale(0) rotate(15deg)"
                      : isHighlighted ? "scale(1.1)" : "scale(1)",
                    opacity: isBlasting ? 0 : 1,
                    zIndex: isHighlighted ? 10 : 1,
                    touchAction: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Special block label */}
                  {cell.special && cell.special !== "rainbow" && (
                    <span className="absolute inset-0 flex items-center justify-center text-white font-black text-[9px] pointer-events-none select-none">
                      {cell.special === "bomb" ? "💣" :
                        cell.special === "multiplier" ? "2×" :
                          cell.special === "lightning" ? "⚡" :
                            cell.special === "star" ? "⭐" : ""}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Event Message */}
        {eventMessage && !gameOver && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 rounded-lg shadow-lg animate-bounce z-20 pointer-events-none">
            <p className="text-white font-bold text-sm whitespace-nowrap">{eventMessage}</p>
          </div>
        )}

        {/* Combo Message */}
        {comboMessage && !gameOver && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <p className={`text-3xl font-black drop-shadow-lg animate-bounce ${comboMessage.color}`}>
              {comboMessage.message}
            </p>
          </div>
        )}

        {/* Active Multiplier */}
        {activeMultiplier > 1 && !gameOver && (
          <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-1 rounded-full shadow-lg z-20">
            <p className="text-white font-bold text-sm">{activeMultiplier}×</p>
          </div>
        )}

        {/* Start Overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className="text-white font-bold text-xl mb-2">Block Blast</p>
              <p className="text-gray-300 text-sm">Loading…</p>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <p className={`text-2xl font-bold mb-2 ${hasWon ? "text-green-500" : "text-amber-500"}`}>
                {hasWon ? "🎉 YOU WIN!" : "GAME OVER"}
              </p>
              {hasWon && <p className="text-yellow-400 text-sm mb-1">+3 satoshis earned!</p>}
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
        <Card className="p-4 bg-gray-900 border-gray-700">
          <div className="space-y-3">
            <div>
              <p className="text-gray-400 text-xs">Score</p>
              <p className="text-2xl font-bold text-white">{score.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Progress to win</p>
              <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
                <div
                  className="h-2 rounded-full transition-all duration-300 bg-gradient-to-r from-amber-500 to-green-400"
                  style={{ width: `${Math.min(100, (score / winThreshold) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-green-400 font-bold">{score.toLocaleString()} / {winThreshold.toLocaleString()}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Moves Left</p>
                <p className={`font-bold text-lg ${movesLeft <= 5 ? "text-red-400" : "text-green-400"}`}>{movesLeft}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Blasted</p>
                <p className="font-bold text-lg text-blue-400">{moves}</p>
              </div>
            </div>
            {combo > 1 && (
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="h-4 w-4" />
                <span className="font-bold">{combo}× Cascade!</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">How to Play</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Tap a block to select its group</li>
            <li>Groups of 3+ glow white</li>
            <li>Tap again to blast them!</li>
            <li>Cascades score bonus points</li>
            <li>Reach {winThreshold} to win!</li>
          </ul>
        </Card>

        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">Special Blocks</p>
          <div className="space-y-1 text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><span>💣</span><span>Bomb — clears 3×3 area</span></div>
            <div className="flex items-center gap-1.5"><span>⚡</span><span>Lightning — clears whole row</span></div>
            <div className="flex items-center gap-1.5"><span>⭐</span><span>Star — clears all of one color</span></div>
            <div className="flex items-center gap-1.5"><span>2×</span><span>Multiplier — 2× points 5 s</span></div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "linear-gradient(135deg,#ef4444,#22c55e,#3b82f6)" }} />
              <span>Rainbow — matches any color</span>
            </div>
          </div>
        </Card>

        {difficultyLevel > 1 && (
          <Card className="p-3 bg-gray-900 border-gray-700">
            <p className="text-gray-400 text-xs mb-2">Difficulty Level</p>
            <div className="flex gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-3 rounded-sm ${i < difficultyLevel
                    ? difficultyLevel <= 3 ? "bg-green-500" : difficultyLevel <= 6 ? "bg-yellow-500" : "bg-red-500"
                    : "bg-gray-700"}`}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
