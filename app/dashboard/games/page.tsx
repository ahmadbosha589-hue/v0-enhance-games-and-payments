"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Gamepad2,
  Coins,
  Clock,
  Trophy,
  Zap,
  AlertCircle,
  CheckCircle2,
  Timer,
  Target,
  Car,
  Grid3X3,
  Blocks,
  Star,
  Crown,
  Medal,
  Flame,
  Gift,
  Users,
  Calendar,
  Award,
  Sparkles,
  Lock,
  Play,
  ChevronRight,
  XCircle,
  Wallet
} from "lucide-react"
import { TetrisGame } from "@/components/games/tetris-game"
import { BlockBlastGame } from "@/components/games/block-blast-game"
import { CarRacingGame } from "@/components/games/car-racing-game"
import { SnakeGame } from "@/components/games/snake-game"
import { MemoryGame } from "@/components/games/memory-game"
import { FlappyGame } from "@/components/games/flappy-game"
import { useLanguage } from "@/lib/i18n/language-context"
import { cn } from "@/lib/utils"
import useSWR from "swr"
import Image from "next/image"
import {
  GAME_ACHIEVEMENTS,
  generateMockTournaments,
  generateMockLeaderboard,
  type TournamentInfo,
  type LeaderboardEntry
} from "@/lib/games/game-engine"

type GameType = "tetris" | "block_blast" | "car_racing" | "snake" | "memory" | "flappy"

interface GameStatusPerGame {
  canPlay: boolean
  waitSeconds: number
  cooldownUntil: string | null
  winThreshold: number
}

interface DifficultyInfo {
  level: number
  description: string
  speedMultiplier: number
  obstacleFrequency: number
  bonusChance: number
  scoreMultiplier: number
  resetsIn?: string // Time until daily reset
}

interface GameStatus {
  gameStatuses: Record<GameType, GameStatusPerGame>
  gamesPlayedToday: number
  gamesRemaining: number
  maxGamesPerDay: number
  totalEarnedToday: number
  rewardPerGame: number
  cooldownMinutes: number
  currentBalance: number
  recentGames: Array<{
    id: string
    game_type: GameType
    score: number
    reward_satoshis: number
    status: string
    created_at: string
  }>
  winThresholds: Record<GameType, number>
  difficulty?: DifficultyInfo
  totalGamesPlayed?: number
}

interface GameSession {
  sessionId: string
  sessionToken: string
  challenge: string
  gameType: GameType
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Generate a browser fingerprint for anti-bot verification
function generateFingerprint(): string {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.textBaseline = "top"
    ctx.font = "14px 'Arial'"
    ctx.fillText("fingerprint", 2, 2)
  }

  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    canvas.toDataURL()
  ].join("|")

  // Simple hash
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36) + Date.now().toString(36)
}

export default function GamesPage() {
  const { t } = useLanguage()
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [gameSession, setGameSession] = useState<GameSession | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentScore, setCurrentScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [gameCooldowns, setGameCooldowns] = useState<Record<GameType, number>>({
    tetris: 0,
    block_blast: 0,
    car_racing: 0,
    snake: 0,
    memory: 0,
    flappy: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ message: string; isWin: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState("games")
  const [selectedLeaderboardGame, setSelectedLeaderboardGame] = useState<GameType>("tetris")
  const [showAchievementModal, setShowAchievementModal] = useState(false)
  const [newAchievement, setNewAchievement] = useState<typeof GAME_ACHIEVEMENTS[0] | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [gameResult, setGameResult] = useState<{
    isWin: boolean
    score: number
    reward: number
    winThreshold: number
    newBalance: number
  } | null>(null)
  const [tournaments] = useState<TournamentInfo[]>(() => generateMockTournaments())
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

  const { data: gameStatus, mutate: refreshStatus } = useSWR<GameStatus>(
    "/api/games/status",
    fetcher,
    { refreshInterval: 5000 }
  )

  // Calculate user high scores from recent games (fetched from database via gameStatus)
  const userHighScores = useMemo(() => {
    if (!gameStatus?.recentGames) return {}
    const scores: Record<string, number> = {}
    for (const game of gameStatus.recentGames) {
      const type = game.game_type
      if (!scores[type] || game.score > scores[type]) {
        scores[type] = game.score
      }
    }
    return scores
  }, [gameStatus?.recentGames])

  // Update leaderboard when game type changes
  useEffect(() => {
    setLeaderboard(generateMockLeaderboard(selectedLeaderboardGame, userHighScores[selectedLeaderboardGame]))
  }, [selectedLeaderboardGame, userHighScores])

  // Per-game countdown timers - more robust implementation
  useEffect(() => {
    if (!gameStatus?.gameStatuses) return

    // Initialize cooldowns from server data - only update if server data changed
    const serverCooldowns: Record<GameType, number> = {
      tetris: 0,
      block_blast: 0,
      car_racing: 0,
      snake: 0,
      memory: 0,
      flappy: 0
    }

    Object.entries(gameStatus.gameStatuses).forEach(([gameType, status]) => {
      if (status.waitSeconds > 0) {
        serverCooldowns[gameType as GameType] = Math.max(0, Math.floor(status.waitSeconds))
      }
    })

    // Update cooldowns - use server values if they're higher than current local values
    setGameCooldowns(prev => {
      const updated = { ...prev }
      Object.keys(serverCooldowns).forEach(key => {
        const gameType = key as GameType
        // Use server value if it's higher (more recent cooldown set) or if local is 0
        if (serverCooldowns[gameType] > updated[gameType] || updated[gameType] === 0) {
          updated[gameType] = serverCooldowns[gameType]
        }
      })
      return updated
    })
  }, [gameStatus?.gameStatuses])

  // Separate timer effect for countdown - runs independently
  useEffect(() => {
    const interval = setInterval(() => {
      setGameCooldowns(prev => {
        const updated = { ...prev }
        let anyChanged = false
        let anyHitZero = false

        Object.keys(updated).forEach(key => {
          const gameType = key as GameType
          if (updated[gameType] > 0) {
            updated[gameType] = Math.max(0, updated[gameType] - 1)
            anyChanged = true
            if (updated[gameType] === 0) {
              anyHitZero = true
            }
          }
        })

        // Refresh status when a cooldown hits 0 to get fresh server data
        if (anyHitZero) {
          refreshStatus()
        }

        return anyChanged ? updated : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [refreshStatus])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const canPlayGame = (gameType: GameType): boolean => {
    if (!gameStatus) return false
    if (gameStatus.gamesRemaining <= 0) return false
    if (gameCooldowns[gameType] > 0) return false
    return true
  }

  const startGame = async (gameType: GameType) => {
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    try {
      const fingerprint = generateFingerprint()

      const response = await fetch("/api/games/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType,
          fingerprint,
          screenResolution: `${screen.width}x${screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      })

      let data
      try {
        data = await response.json()
      } catch {
        throw new Error("Server error. Please try again.")
      }

      if (!response.ok) {
        // Update cooldown for this specific game if provided
        if (data.waitSeconds && data.waitSeconds > 0) {
          setGameCooldowns(prev => ({
            ...prev,
            [data.gameType || gameType]: Math.ceil(data.waitSeconds)
          }))
        }
        // Refresh status to get latest cooldowns
        refreshStatus()
        throw new Error(data.error || "Failed to start game")
      }

      // Validate response has required fields
      if (!data.sessionId || !data.sessionToken || !data.challenge) {
        throw new Error("Invalid server response. Please try again.")
      }

      setGameSession({
        sessionId: data.sessionId,
        sessionToken: data.sessionToken,
        challenge: data.challenge,
        gameType
      })
      setSelectedGame(gameType)
      setIsPlaying(true)
      setCurrentScore(0)
      setMoves(0)
    } catch (err: any) {
      setError(err.message || "Failed to start game. Please try again.")
      // Refresh status on error to ensure cooldowns are correct
      refreshStatus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleGameEnd = useCallback(async (score: number, gameMoves: number) => {
    if (!gameSession) return

    setIsLoading(true)
    setError(null)

    try {
      // Parse the challenge to get the solution
      const [, a, b] = gameSession.challenge.split(":")
      const solution = (parseInt(a) + parseInt(b)).toString()
      const fingerprint = generateFingerprint()

      const response = await fetch("/api/games/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: gameSession.sessionId,
          sessionToken: gameSession.sessionToken,
          score,
          challengeAnswer: solution,
          gameData: { moves: gameMoves },
          fingerprint
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete game")
      }

      // Show result modal
      setGameResult({
        isWin: data.isWinner,
        score: data.score,
        reward: data.reward,
        winThreshold: data.winThreshold,
        newBalance: data.newBalance
      })
      setShowResultModal(true)

      // Update cooldown for this specific game
      if (data.cooldownMinutes) {
        setGameCooldowns(prev => ({
          ...prev,
          [gameSession.gameType]: data.cooldownMinutes * 60
        }))
      }

      // Set success message
      setSuccess({
        message: data.isWinner
          ? `You won ${data.reward} satoshis! Score: ${score.toLocaleString()}`
          : `You need ${data.winThreshold} points to win. You scored ${score.toLocaleString()}. Try again!`,
        isWin: data.isWinner
      })

      // Check for new achievements
      const unlockedAchievement = GAME_ACHIEVEMENTS.find(a =>
        !a.unlocked && Math.random() < 0.1 // Simulated achievement unlock
      )
      if (unlockedAchievement && data.isWinner) {
        setNewAchievement(unlockedAchievement)
        setShowAchievementModal(true)
      }

      refreshStatus()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
      setIsPlaying(false)
      setGameSession(null)
    }
  }, [gameSession, refreshStatus])

  const handleScoreUpdate = useCallback((score: number) => {
    setCurrentScore(score)
  }, [])

  const games = [
    {
      type: "tetris" as GameType,
      name: "Tetris",
      description: "Stack falling blocks and clear lines for massive combos",
      icon: Grid3X3,
      color: "from-cyan-500 to-blue-600",
      borderColor: "border-cyan-500/30",
      bgColor: "bg-cyan-500/10",
      image: "/images/games/tetris.jpg",
      difficulty: "Medium",
      avgPlayTime: "1-3 min"
    },
    {
      type: "block_blast" as GameType,
      name: "Block Blast",
      description: "Match 3+ blocks with special power-ups and multipliers",
      icon: Blocks,
      color: "from-purple-500 to-pink-600",
      borderColor: "border-purple-500/30",
      bgColor: "bg-purple-500/10",
      image: "/images/games/block-blast.jpg",
      difficulty: "Easy",
      avgPlayTime: "1-3 min"
    },
    {
      type: "car_racing" as GameType,
      name: "Car Racing",
      description: "Dodge obstacles, collect power-ups and earn near-miss bonuses",
      icon: Car,
      color: "from-orange-500 to-red-600",
      borderColor: "border-orange-500/30",
      bgColor: "bg-orange-500/10",
      image: "/images/games/car-racing.jpg",
      difficulty: "Hard",
      avgPlayTime: "1-3 min"
    },
    {
      type: "snake" as GameType,
      name: "Snake",
      description: "Eat special food types with combo multipliers",
      icon: Zap,
      color: "from-emerald-500 to-green-600",
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-500/10",
      image: "/images/games/snake.jpg",
      difficulty: "Medium",
      avgPlayTime: "1-3 min"
    },
    {
      type: "memory" as GameType,
      name: "Memory Match",
      description: "Find pairs with streak bonuses and perfect game rewards",
      icon: Target,
      color: "from-amber-500 to-yellow-600",
      borderColor: "border-amber-500/30",
      bgColor: "bg-amber-500/10",
      image: "/images/games/memory.jpg",
      difficulty: "Easy",
      avgPlayTime: "1-3 min"
    },
    {
      type: "flappy" as GameType,
      name: "Flappy Bird",
      description: "Fly through pipes with shields, slow-mo and coin bonuses",
      icon: Trophy,
      color: "from-sky-500 to-indigo-600",
      borderColor: "border-sky-500/30",
      bgColor: "bg-sky-500/10",
      image: "/images/games/flappy.jpg",
      difficulty: "Hard",
      avgPlayTime: "1-3 min"
    }
  ]

  const unlockedAchievements = GAME_ACHIEVEMENTS.filter((_, i) => i < 5) // Simulated unlocked
  const lockedAchievements = GAME_ACHIEVEMENTS.filter((_, i) => i >= 5)

  if (!gameStatus) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Gamepad2 className="h-7 w-7 text-primary" />
            Game Center
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Play games, earn satoshis, and climb the leaderboards
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm py-1.5 px-3">
            <Wallet className="h-4 w-4 mr-1.5 text-green-500" />
            {gameStatus.currentBalance} sats
          </Badge>
          <Badge variant="secondary" className="text-sm py-1.5 px-3">
            <Coins className="h-4 w-4 mr-1.5 text-yellow-500" />
            {gameStatus.rewardPerGame} sats/win
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Games Today</p>
                <p className="text-lg font-bold">{gameStatus.gamesPlayedToday}/{gameStatus.maxGamesPerDay}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Earned Today</p>
                <p className="text-lg font-bold">{gameStatus.totalEarnedToday} sats</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Games Left</p>
                <p className="text-lg font-bold">{gameStatus.gamesRemaining}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win Reward</p>
                <p className="text-lg font-bold">{gameStatus.rewardPerGame} sats</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Difficulty Indicator */}
      {gameStatus.difficulty && (
        <Card className="border-border/50 bg-gradient-to-r from-background to-muted/20">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  gameStatus.difficulty.level <= 2 ? "bg-green-500/20" :
                    gameStatus.difficulty.level <= 4 ? "bg-yellow-500/20" :
                      gameStatus.difficulty.level <= 6 ? "bg-orange-500/20" :
                        gameStatus.difficulty.level <= 8 ? "bg-red-500/20" : "bg-purple-500/20"
                )}>
                  <Flame className={cn(
                    "h-5 w-5",
                    gameStatus.difficulty.level <= 2 ? "text-green-500" :
                      gameStatus.difficulty.level <= 4 ? "text-yellow-500" :
                        gameStatus.difficulty.level <= 6 ? "text-orange-500" :
                          gameStatus.difficulty.level <= 8 ? "text-red-500" : "text-purple-500"
                  )} />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Difficulty: <span className={cn(
                      "font-bold",
                      gameStatus.difficulty.level <= 2 ? "text-green-500" :
                        gameStatus.difficulty.level <= 4 ? "text-yellow-500" :
                          gameStatus.difficulty.level <= 6 ? "text-orange-500" :
                            gameStatus.difficulty.level <= 8 ? "text-red-500" : "text-purple-500"
                    )}>{gameStatus.difficulty.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Level {gameStatus.difficulty.level}/10 - Resets to Easy in {gameStatus.difficulty.resetsIn || "24h"}
                  </p>
                </div>
              </div>
              <div className="flex-1 max-w-xs">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Difficulty Level</span>
                  <span className={cn(
                    "font-medium",
                    gameStatus.difficulty.level <= 2 ? "text-green-500" :
                      gameStatus.difficulty.level <= 4 ? "text-yellow-500" :
                        gameStatus.difficulty.level <= 6 ? "text-orange-500" :
                          gameStatus.difficulty.level <= 8 ? "text-red-500" : "text-purple-500"
                  )}>{gameStatus.difficulty.level}/10</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      gameStatus.difficulty.level <= 2 ? "bg-gradient-to-r from-green-400 to-green-500" :
                        gameStatus.difficulty.level <= 4 ? "bg-gradient-to-r from-yellow-400 to-yellow-500" :
                          gameStatus.difficulty.level <= 6 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                            gameStatus.difficulty.level <= 8 ? "bg-gradient-to-r from-red-400 to-red-500" :
                              "bg-gradient-to-r from-purple-400 to-purple-500"
                    )}
                    style={{ width: `${(gameStatus.difficulty.level / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] mt-1 text-muted-foreground">
                  <span>Speed: {gameStatus.difficulty.speedMultiplier.toFixed(1)}x</span>
                  <span>Obstacles: {gameStatus.difficulty.obstacleFrequency.toFixed(1)}x</span>
                  <span>Bonus: +{Math.round((gameStatus.difficulty.scoreMultiplier - 1) * 100)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className={cn(
          "border-2",
          success.isWin
            ? "border-green-500/30 bg-green-500/10"
            : "border-orange-500/30 bg-orange-500/10"
        )}>
          <CardContent className="p-4 flex items-center gap-3">
            {success.isWin ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-orange-500 shrink-0" />
            )}
            <p className={cn("text-sm", success.isWin ? "text-green-500" : "text-orange-500")}>
              {success.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      {!isPlaying ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="games" className="gap-2 py-2">
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">Games</span>
            </TabsTrigger>
            <TabsTrigger value="tournaments" className="gap-2 py-2">
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">Tournaments</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2 py-2">
              <Medal className="h-4 w-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </TabsTrigger>
            <TabsTrigger value="achievements" className="gap-2 py-2">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Achievements</span>
            </TabsTrigger>
          </TabsList>

          {/* Games Tab */}
          <TabsContent value="games" className="mt-6 space-y-6">
            {/* Daily Progress */}
            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Daily Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {gameStatus.gamesPlayedToday} of {gameStatus.maxGamesPerDay} games
                  </span>
                </div>
                <Progress
                  value={(gameStatus.gamesPlayedToday / gameStatus.maxGamesPerDay) * 100}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Maximum potential today: {gameStatus.maxGamesPerDay * gameStatus.rewardPerGame} satoshis
                </p>
              </CardContent>
            </Card>

            {/* Game Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => {
                const cooldown = gameCooldowns[game.type]
                const canPlay = canPlayGame(game.type)
                const winThreshold = gameStatus.winThresholds?.[game.type] || 100

                return (
                  <Card
                    key={game.type}
                    className={cn(
                      "border-2 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] overflow-hidden group",
                      game.borderColor,
                      game.bgColor
                    )}
                  >
                    <div className="relative h-36 sm:h-40 overflow-hidden">
                      <Image
                        src={game.image}
                        alt={game.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                      <div className={cn(
                        "absolute top-3 left-3 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                        game.color
                      )}>
                        <game.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="absolute top-3 right-3 flex flex-col gap-1">
                        <Badge className="text-[10px]" variant="secondary">
                          <Coins className="h-3 w-3 mr-1 text-yellow-500" />
                          +{gameStatus.rewardPerGame} sats
                        </Badge>
                        <Badge className="text-[10px]" variant="outline">
                          Win: {winThreshold}+ pts
                        </Badge>
                      </div>
                      {userHighScores[game.type] && (
                        <div className="absolute bottom-3 right-3">
                          <Badge variant="secondary" className="text-[10px] bg-background/80">
                            <Star className="h-3 w-3 mr-1 text-yellow-500" />
                            Best: {userHighScores[game.type].toLocaleString()}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-2 pt-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        {game.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          {game.avgPlayTime}
                        </span>
                      </CardTitle>
                      <CardDescription className="text-sm line-clamp-2">{game.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        className={cn(
                          "w-full transition-all",
                          !isLoading && canPlay
                            ? `bg-gradient-to-r ${game.color} hover:opacity-90 text-white`
                            : ""
                        )}
                        onClick={() => startGame(game.type)}
                        disabled={isLoading || !canPlay}
                      >
                        {isLoading ? (
                          <>
                            <Timer className="h-4 w-4 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : cooldown > 0 ? (
                          <>
                            <Clock className="h-4 w-4 mr-2" />
                            Wait {formatTime(cooldown)}
                          </>
                        ) : gameStatus.gamesRemaining <= 0 ? (
                          <>
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Daily Limit
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Play Now
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Recent Games */}
            {gameStatus.recentGames && gameStatus.recentGames.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Recent Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {gameStatus.recentGames.slice(0, 5).map((game) => (
                      <div
                        key={game.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            games.find(g => g.type === game.game_type)?.bgColor
                          )}>
                            {(() => {
                              const Icon = games.find(g => g.type === game.game_type)?.icon
                              return Icon ? <Icon className="h-4 w-4" /> : null
                            })()}
                          </div>
                          <div>
                            <p className="font-medium text-sm flex items-center gap-2">
                              {games.find(g => g.type === game.game_type)?.name}
                              {game.status === "completed" ? (
                                <Badge variant="default" className="text-[10px] bg-green-500">Won</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">Lost</Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Score: {game.score.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={game.reward_satoshis > 0 ? "default" : "secondary"}
                          className={cn("text-xs", game.reward_satoshis > 0 && "bg-green-500")}
                        >
                          {game.reward_satoshis > 0 ? `+${game.reward_satoshis}` : "0"} sats
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tournaments Tab */}
          <TabsContent value="tournaments" className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Active Tournaments</h2>
                <p className="text-sm text-muted-foreground">Compete for prize pools and glory</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {tournaments.reduce((acc, t) => acc + t.participants, 0)} Players Active
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {tournaments.map((tournament) => (
                <Card
                  key={tournament.id}
                  className={cn(
                    "border-2 transition-all hover:shadow-lg",
                    tournament.status === "active" ? "border-green-500/30 bg-green-500/5" :
                      tournament.status === "upcoming" ? "border-blue-500/30 bg-blue-500/5" :
                        "border-muted/30 bg-muted/5 opacity-75"
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Crown className={cn(
                          "h-5 w-5",
                          tournament.status === "active" ? "text-green-500" :
                            tournament.status === "upcoming" ? "text-blue-500" : "text-muted-foreground"
                        )} />
                        {tournament.name}
                      </CardTitle>
                      <Badge
                        variant={tournament.status === "active" ? "default" :
                          tournament.status === "upcoming" ? "secondary" : "outline"}
                      >
                        {tournament.status === "active" && <Sparkles className="h-3 w-3 mr-1" />}
                        {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Prize Pool</p>
                        <p className="text-lg font-bold text-yellow-500">
                          {tournament.prizePool.toLocaleString()} sats
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Entry Fee</p>
                        <p className="text-lg font-bold">{tournament.entryFee} sats</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Players</p>
                        <p className="text-lg font-bold">{tournament.participants}/{tournament.maxParticipants}</p>
                      </div>
                    </div>

                    <Progress
                      value={(tournament.participants / tournament.maxParticipants) * 100}
                      className="h-1"
                    />

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {tournament.status === "ended" ? "Ended" :
                          tournament.status === "active" ? "Ends in 2h" : "Starts in 1h"}
                      </div>
                      <Button
                        size="sm"
                        disabled={tournament.status === "ended"}
                        className={cn(
                          tournament.status === "active" ? "bg-green-600 hover:bg-green-700" : ""
                        )}
                      >
                        {tournament.status === "ended" ? "View Results" :
                          tournament.status === "active" ? "Join Now" : "Register"}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tournament Rules */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  Tournament Rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Entry fee is deducted from your balance when you register</li>
                  <li>Your best score during the tournament period counts</li>
                  <li>Top 10 players split the prize pool (50%, 25%, 10%, 5%...)</li>
                  <li>Cheating results in immediate disqualification and ban</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Global Leaderboards</h2>
                <p className="text-sm text-muted-foreground">Top players across all games</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {games.map((game) => (
                  <Button
                    key={game.type}
                    size="sm"
                    variant={selectedLeaderboardGame === game.type ? "default" : "outline"}
                    onClick={() => setSelectedLeaderboardGame(game.type)}
                    className="gap-1"
                  >
                    <game.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{game.name}</span>
                  </Button>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y">
                    {leaderboard.map((entry) => (
                      <div
                        key={entry.rank}
                        className={cn(
                          "flex items-center gap-4 p-4 transition-colors",
                          entry.isCurrent ? "bg-primary/10" : "hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                          entry.rank === 1 ? "bg-yellow-500 text-yellow-950" :
                            entry.rank === 2 ? "bg-gray-400 text-gray-950" :
                              entry.rank === 3 ? "bg-amber-600 text-amber-950" :
                                "bg-muted text-muted-foreground"
                        )}>
                          {entry.rank <= 3 ? (
                            entry.rank === 1 ? <Crown className="h-5 w-5" /> :
                              entry.rank === 2 ? <Medal className="h-5 w-5" /> :
                                <Award className="h-5 w-5" />
                          ) : entry.rank}
                        </div>
                        <div className="flex-1">
                          <p className={cn(
                            "font-medium",
                            entry.isCurrent && "text-primary"
                          )}>
                            {entry.username}
                            {entry.isCurrent && (
                              <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Score: {entry.score.toLocaleString()}
                          </p>
                        </div>
                        {entry.rank <= 3 && (
                          <Badge variant="secondary" className="gap-1">
                            <Gift className="h-3 w-3" />
                            {entry.rank === 1 ? "1000" : entry.rank === 2 ? "500" : "250"} sats
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements" className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Achievements</h2>
                <p className="text-sm text-muted-foreground">
                  Unlock achievements to earn bonus satoshis
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Star className="h-3 w-3 text-yellow-500" />
                {unlockedAchievements.length}/{GAME_ACHIEVEMENTS.length} Unlocked
              </Badge>
            </div>

            <div className="space-y-4">
              {/* Unlocked Achievements */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Unlocked ({unlockedAchievements.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {unlockedAchievements.map((achievement) => (
                    <Card key={achievement.id} className="border-green-500/30 bg-green-500/5">
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-green-500/20">
                          <Trophy className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{achievement.name}</p>
                          <p className="text-xs text-muted-foreground">{achievement.description}</p>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            <Coins className="h-3 w-3 mr-1" />
                            +{achievement.reward} sats earned
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Locked Achievements */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Locked ({lockedAchievements.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lockedAchievements.map((achievement) => (
                    <Card key={achievement.id} className="border-muted/30 bg-muted/5 opacity-75">
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted/50">
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{achievement.name}</p>
                          <p className="text-xs text-muted-foreground">{achievement.description}</p>
                          <Badge variant="outline" className="mt-2 text-xs">
                            <Gift className="h-3 w-3 mr-1" />
                            +{achievement.reward} sats reward
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        // Active Game
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {games.find(g => g.type === selectedGame)?.icon && (
                  <div className={cn(
                    "p-2 rounded-lg",
                    games.find(g => g.type === selectedGame)?.bgColor
                  )}>
                    {(() => {
                      const Icon = games.find(g => g.type === selectedGame)?.icon
                      return Icon ? <Icon className="h-5 w-5" /> : null
                    })()}
                  </div>
                )}
                {games.find(g => g.type === selectedGame)?.name}
              </CardTitle>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-sm">
                  <Target className="h-3.5 w-3.5 mr-1.5 text-orange-500" />
                  Win: {gameStatus.winThresholds?.[selectedGame!] || 100}+ pts
                </Badge>
                <Badge variant="outline" className="text-sm">
                  <Trophy className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                  Score: {currentScore.toLocaleString()}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {selectedGame === "tetris" && (
              <TetrisGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
            {selectedGame === "block_blast" && (
              <BlockBlastGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
            {selectedGame === "car_racing" && (
              <CarRacingGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
            {selectedGame === "snake" && (
              <SnakeGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
            {selectedGame === "memory" && (
              <MemoryGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
            {selectedGame === "flappy" && (
              <FlappyGame
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
                difficulty={gameStatus?.difficulty}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Game Result Modal */}
      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              {gameResult?.isWin ? (
                <>
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  You Won!
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-orange-500" />
                  Try Again!
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-center">
              {gameResult?.isWin
                ? "Congratulations! You earned satoshis!"
                : "You didn't reach the win threshold. Keep practicing!"}
            </DialogDescription>
          </DialogHeader>
          {gameResult && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className={cn(
                "p-4 rounded-full",
                gameResult.isWin
                  ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20"
                  : "bg-gradient-to-br from-orange-500/20 to-red-500/20"
              )}>
                {gameResult.isWin ? (
                  <Coins className="h-12 w-12 text-yellow-500" />
                ) : (
                  <Target className="h-12 w-12 text-orange-500" />
                )}
              </div>
              <div className="text-center space-y-2">
                <p className="text-2xl font-bold">
                  Score: {gameResult.score.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Win threshold: {gameResult.winThreshold} points
                </p>
              </div>
              {gameResult.isWin ? (
                <Badge className="text-lg px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                  <Coins className="h-5 w-5 mr-2" />
                  +{gameResult.reward} satoshis
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <XCircle className="h-5 w-5 mr-2" />
                  No reward
                </Badge>
              )}
              <p className="text-sm text-muted-foreground">
                New Balance: {gameResult.newBalance} satoshis
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Achievement Unlock Modal */}
      <Dialog open={showAchievementModal} onOpenChange={setShowAchievementModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              <Sparkles className="h-6 w-6 text-yellow-500" />
              Achievement Unlocked!
            </DialogTitle>
            <DialogDescription className="text-center">
              Congratulations! You&apos;ve earned a new achievement.
            </DialogDescription>
          </DialogHeader>
          {newAchievement && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="p-4 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
                <Trophy className="h-12 w-12 text-yellow-500" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold">{newAchievement.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{newAchievement.description}</p>
              </div>
              <Badge className="text-lg px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                <Coins className="h-5 w-5 mr-2" />
                +{newAchievement.reward} satoshis
              </Badge>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rules Card */}
      {!isPlaying && activeTab === "games" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Game Rules & Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Each game has its own {gameStatus.cooldownMinutes}-minute cooldown (play different games while waiting)</li>
              <li>Win {gameStatus.rewardPerGame} satoshis by reaching the game&apos;s win threshold score</li>
              <li>If you don&apos;t reach the threshold, you don&apos;t earn satoshis but can try again after cooldown</li>
              <li>Maximum {gameStatus.maxGamesPerDay} games per day across all game types</li>
              <li>Games must be played legitimately - bots are not allowed</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
