"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RotateCcw, Timer, Sparkles, Trophy, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

const CARD_ICONS = [
  "🎮", "🎯", "🏆", "💎", "🚀", "⚡", "🔥", "💰",
  "🌟", "🎲", "🃏", "👑", "💫", "🎪", "🎨", "🎭"
]

interface MemoryCard {
  id: number
  icon: string
  isFlipped: boolean
  isMatched: boolean
}

interface DifficultySettings {
  level: number
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
}

interface MemoryGameProps {
  onGameEnd: (score: number, moves: number) => void
  onScoreUpdate: (score: number) => void
  isActive: boolean
  difficulty?: DifficultySettings
  winThreshold?: number // Score needed to win and get reward
}

const GRID_SIZES = {
  easy: { cols: 4, rows: 3, pairs: 6, timeBonus: 1000 },
  medium: { cols: 4, rows: 4, pairs: 8, timeBonus: 800 },
  hard: { cols: 6, rows: 4, pairs: 12, timeBonus: 600 }
}

export function MemoryGame({ onGameEnd, onScoreUpdate, isActive, difficulty: externalDifficulty, winThreshold = 100 }: MemoryGameProps) {
  // Choose grid difficulty based on level
  const gridDifficulty = externalDifficulty && externalDifficulty.level >= 5
    ? "hard"
    : externalDifficulty && externalDifficulty.level >= 3
      ? "medium"
      : "easy"
  const [difficulty] = useState<keyof typeof GRID_SIZES>(gridDifficulty)
  const [hasWon, setHasWon] = useState(false)
  const [cards, setCards] = useState<MemoryCard[]>([])
  const [flippedCards, setFlippedCards] = useState<number[]>([])
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [moves, setMoves] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(120)
  const [gameOver, setGameOver] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [combo, setCombo] = useState(0)
  const [lastMatchTime, setLastMatchTime] = useState(0)
  const [streak, setStreak] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [perfectGame, setPerfectGame] = useState(true)
  const [matchAnimation, setMatchAnimation] = useState<number[]>([])

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const config = GRID_SIZES[difficulty]

  // Win detection - game ends when ALL pairs are matched (not score threshold)
  // The score threshold is just for determining if player "wins" the reward
  // The game itself must be completed (all pairs found) before ending
  // REMOVED auto-win based on score - this was causing premature wins

  // Initialize game
  const initializeGame = useCallback(() => {
    setHasWon(false)
    const selectedIcons = CARD_ICONS.slice(0, config.pairs)
    const cardPairs = [...selectedIcons, ...selectedIcons]

    // Fisher-Yates shuffle
    for (let i = cardPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardPairs[i], cardPairs[j]] = [cardPairs[j], cardPairs[i]]
    }

    setCards(cardPairs.map((icon, index) => ({
      id: index,
      icon,
      isFlipped: false,
      isMatched: false
    })))
    setFlippedCards([])
    setMatchedPairs(0)
    setMoves(0)
    setScore(0)
    setTimeLeft(120)
    setGameOver(false)
    setCombo(0)
    setStreak(0)
    setHintsUsed(0)
    setPerfectGame(true)
    setMatchAnimation([])
    hasEndedRef.current = false
  }, [config.pairs])

  useEffect(() => {
    if (isActive) {
      initializeGame()
    }
  }, [isActive, initializeGame])

  // Track if game has ended to prevent multiple onGameEnd calls
  const hasEndedRef = useRef(false)

  // Timer - with proper cleanup and state handling
  useEffect(() => {
    // Reset hasEnded when game restarts
    if (!gameOver && !hasWon) {
      hasEndedRef.current = false
    }

    if (!isActive || gameOver || hasWon) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1 && !hasEndedRef.current) {
          hasEndedRef.current = true
          // Time ran out - game over (loss)
          setGameOver(true)
          // Use setTimeout to avoid state update during render
          setTimeout(() => onGameEnd(score, moves), 0)
          return 0
        }
        return prev > 0 ? prev - 1 : 0
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isActive, gameOver, hasWon, score, moves, onGameEnd])

  // Check for matches - FIXED: Only win when ALL pairs are matched, not based on score
  useEffect(() => {
    if (flippedCards.length !== 2) return
    if (gameOver) return // Prevent processing if game already ended

    setIsChecking(true)
    const [first, second] = flippedCards

    // Validate indices
    if (!cards[first] || !cards[second]) {
      setFlippedCards([])
      setIsChecking(false)
      return
    }

    if (cards[first].icon === cards[second].icon) {
      // Match found
      const now = Date.now()
      const timeSinceLastMatch = now - lastMatchTime

      // Only count as quick match if TWO pairs matched within 2 seconds (stricter requirement)
      const isQuickMatch = timeSinceLastMatch < 2000 && lastMatchTime > 0

      // Combo system - starts at 1, max 3, only increases on quick consecutive matches
      let newCombo = 1
      if (isQuickMatch && combo >= 1) {
        newCombo = Math.min(combo + 1, 3) // Cap combo at x3 max
      }

      // Streak only increases if this is at least the 2nd quick match in a row
      const newStreak = isQuickMatch && combo >= 2 ? Math.min(streak + 1, 5) : 0 // Cap streak at 5 max

      setCombo(newCombo)
      setStreak(newStreak)
      setLastMatchTime(now)
      setMatchAnimation([first, second])

      // Realistic scoring - base 10 points per match, small bonuses
      const basePoints = 10
      const comboBonus = newCombo >= 2 ? (newCombo - 1) * 2 : 0 // x2 combo = +2, x3 combo = +4
      const streakBonus = newStreak >= 2 ? newStreak : 0 // Only show streak bonus when streak >= 2
      const points = basePoints + comboBonus + streakBonus

      setTimeout(() => {
        // Update matched cards
        setCards(prev => prev.map(card =>
          card.id === first || card.id === second
            ? { ...card, isMatched: true, isFlipped: true }
            : card
        ))

        // Calculate new score
        const newScore = score + points
        setScore(newScore)
        onScoreUpdate(newScore)

        // Update matched pairs count and check for game completion
        const newMatchedPairs = matchedPairs + 1
        setMatchedPairs(newMatchedPairs)

        // CRITICAL FIX: Only end game when ALL pairs are matched
        // The game has config.pairs total pairs - player must match ALL of them
        if (newMatchedPairs >= config.pairs && !hasEndedRef.current) {
          hasEndedRef.current = true
          // All pairs found - game complete!
          const finalBonus = perfectGame ? 20 : 0
          const finalScore = newScore + finalBonus

          // Update final score with bonus
          setScore(finalScore)
          onScoreUpdate(finalScore)
          setHasWon(true)
          setGameOver(true)

          // Small delay to let state update before calling onGameEnd
          setTimeout(() => {
            onGameEnd(finalScore, moves)
          }, 100)
        }

        setFlippedCards([])
        setIsChecking(false)
        setMatchAnimation([])
      }, 500)
    } else {
      // No match - flip cards back after delay
      setPerfectGame(false)
      setCombo(0)
      setStreak(0) // Reset streak on mismatch

      // Store the indices before the timeout to prevent stale closure
      const cardToReset1 = first
      const cardToReset2 = second

      setTimeout(() => {
        // Reset only these specific cards - use functional update to get latest state
        setCards(prev => prev.map(card => {
          if ((card.id === cardToReset1 || card.id === cardToReset2) && !card.isMatched) {
            return { ...card, isFlipped: false }
          }
          return card
        }))
        setFlippedCards([])
        setIsChecking(false)
      }, 1000)
    }
  }, [flippedCards, cards, score, combo, streak, timeLeft, lastMatchTime, config.pairs, moves, perfectGame, onGameEnd, onScoreUpdate, matchedPairs, gameOver])

  const handleCardClick = useCallback((cardId: number) => {
    // Prevent clicking when game is not active or game over
    if (!isActive || gameOver) return
    // If checking, reset the checking state after a delay to prevent stuck state
    if (isChecking) {
      // Force reset if stuck for too long
      setTimeout(() => {
        setIsChecking(false)
      }, 1500)
      return
    }
    // Only allow 2 cards flipped at a time
    if (flippedCards.length >= 2) return
    // Prevent clicking same card or already matched/flipped cards
    const card = cards[cardId]
    if (!card || card.isFlipped || card.isMatched) return
    if (flippedCards.includes(cardId)) return

    // Immediately mark this card as flipped to prevent double-clicking
    const newFlippedCards = [...flippedCards, cardId]
    setFlippedCards(newFlippedCards)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, isFlipped: true } : c
    ))

    if (newFlippedCards.length === 2) {
      setMoves(m => m + 1)
      // Set a safety timeout to reset isChecking in case it gets stuck
      setTimeout(() => {
        setIsChecking(false)
      }, 2000)
    }
  }, [isActive, gameOver, isChecking, flippedCards, cards])

  const useHint = () => {
    if (hintsUsed >= 3 || gameOver) return

    // Find an unmatched pair and briefly show them
    const unmatchedCards = cards.filter(c => !c.isMatched)
    const icons = [...new Set(unmatchedCards.map(c => c.icon))]
    const randomIcon = icons[Math.floor(Math.random() * icons.length)]
    const pairCards = cards.filter(c => c.icon === randomIcon && !c.isMatched)

    setShowHint(true)
    setCards(prev => prev.map(card =>
      pairCards.some(p => p.id === card.id) ? { ...card, isFlipped: true } : card
    ))
    setHintsUsed(h => h + 1)
    setPerfectGame(false)

    // Deduct points for hint
    setScore(s => Math.max(0, s - 5))

    setTimeout(() => {
      setCards(prev => prev.map(card =>
        pairCards.some(p => p.id === card.id) && !card.isMatched
          ? { ...card, isFlipped: false }
          : card
      ))
      setShowHint(false)
    }, 1500)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full">
      {/* Game Board */}
      <div className="relative bg-gray-900 rounded-lg p-3 sm:p-4 border-2 border-gray-700 touch-none select-none overflow-hidden flex-shrink-0" style={{ maxWidth: "100%" }}>
        <div
          className="grid gap-1.5 sm:gap-2"
          style={{
            gridTemplateColumns: `repeat(${config.cols}, minmax(48px, 64px))`,
          }}
        >
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={(e) => {
                e.preventDefault()
                handleCardClick(card.id)
              }}
              onTouchStart={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isChecking && !card.isFlipped && !card.isMatched) {
                  handleCardClick(card.id)
                }
              }}
              disabled={!isActive || gameOver || isChecking || card.isFlipped || card.isMatched}
              className={cn(
                "w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg transition-all duration-300 transform text-xl sm:text-2xl",
                "flex items-center justify-center text-2xl font-bold",
                "disabled:cursor-not-allowed",
                card.isFlipped || card.isMatched
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600 rotate-0 scale-100"
                  : "bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700",
                card.isMatched && "ring-2 ring-green-500 shadow-lg shadow-green-500/30",
                matchAnimation.includes(card.id) && "animate-bounce",
                !card.isFlipped && !card.isMatched && "hover:scale-105"
              )}
              style={{
                transformStyle: "preserve-3d",
              }}
            >
              {(card.isFlipped || card.isMatched) && (
                <span className="animate-scale-in">{card.icon}</span>
              )}
              {!card.isFlipped && !card.isMatched && (
                <span className="text-gray-600">?</span>
              )}
            </button>
          ))}
        </div>

        {/* Game Over Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
            <div className="text-center p-6">
              {matchedPairs === config.pairs ? (
                <>
                  <Trophy className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-500 mb-2">YOU WIN!</p>
                  {perfectGame && (
                    <p className="text-yellow-400 text-sm mb-2">Perfect Game! +20 Bonus</p>
                  )}
                </>
              ) : (
                <>
                  <Timer className="h-12 w-12 text-red-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-red-500 mb-2">TIME&apos;S UP!</p>
                </>
              )}
              <p className="text-white mb-1">Score: {score.toLocaleString()}</p>
              <p className="text-gray-400 text-sm mb-4">Moves: {moves} | Pairs: {matchedPairs}/{config.pairs}</p>
              <Button onClick={initializeGame} variant="outline" size="sm">
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
              <p className="text-2xl font-bold text-white">{score}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-gray-400 text-xs">Moves</p>
                <p className="font-bold text-lg text-blue-400">{moves}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Pairs</p>
                <p className="font-bold text-lg text-green-400">{matchedPairs}/{config.pairs}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Time Left</p>
              <p className={cn(
                "font-bold text-lg font-mono",
                timeLeft <= 30 ? "text-red-400 animate-pulse" : "text-amber-400"
              )}>
                {formatTime(timeLeft)}
              </p>
            </div>
            {combo >= 2 && (
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="h-4 w-4" />
                <span className="font-bold">x{combo} Combo!</span>
              </div>
            )}
            {streak >= 2 && (
              <div className="flex items-center gap-2 text-purple-400">
                <Trophy className="h-4 w-4" />
                <span className="font-bold">x{streak} Streak!</span>
              </div>
            )}
          </div>
        </Card>

        {/* Hint Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={useHint}
          disabled={hintsUsed >= 3 || gameOver || showHint}
        >
          <Brain className="h-4 w-4 mr-2" />
          Hint ({3 - hintsUsed} left)
        </Button>

        {/* How to Play */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2 font-medium">How to Play</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Click cards to flip them</li>
            <li>Find matching pairs</li>
            <li>Quick matches = combo bonus</li>
            <li>Beat the clock!</li>
            <li>Perfect game = +20 bonus</li>
          </ul>
        </Card>

        {/* Progress */}
        <Card className="p-3 bg-gray-900 border-gray-700">
          <p className="text-gray-400 text-xs mb-2">Progress</p>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(matchedPairs / config.pairs) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            {config.pairs - matchedPairs} pairs remaining
          </p>
        </Card>
      </div>
    </div>
  )
}
