"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
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
  Blocks
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

type GameType = "tetris" | "block_blast" | "car_racing" | "snake" | "memory" | "flappy"

interface GameStatus {
  canPlay: boolean
  waitSeconds: number
  nextGameAt: string | null
  gamesPlayedToday: number
  gamesRemaining: number
  maxGamesPerDay: number
  totalEarnedToday: number
  rewardPerGame: number
  cooldownMinutes: number
  recentGames: Array<{
    id: string
    game_type: GameType
    score: number
    reward_satoshis: number
    created_at: string
  }>
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
  const [countdown, setCountdown] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { data: gameStatus, mutate: refreshStatus } = useSWR<GameStatus>(
    "/api/games/status",
    fetcher,
    { refreshInterval: 5000 }
  )

  // Countdown timer
  useEffect(() => {
    if (gameStatus?.waitSeconds && gameStatus.waitSeconds > 0) {
      setCountdown(gameStatus.waitSeconds)
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            refreshStatus()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    } else {
      setCountdown(0)
    }
  }, [gameStatus?.waitSeconds, refreshStatus])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
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

      const data = await response.json()

      if (!response.ok) {
        if (data.waitSeconds) {
          setCountdown(data.waitSeconds)
        }
        throw new Error(data.error || "Failed to start game")
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
      setError(err.message)
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

      setSuccess(`You earned ${data.reward} satoshis! Score: ${score.toLocaleString()}`)
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
      description: "Stack falling blocks and clear lines",
      icon: Grid3X3,
      color: "from-cyan-500 to-blue-600",
      borderColor: "border-cyan-500/30",
      bgColor: "bg-cyan-500/10",
      image: "/images/games/tetris.jpg"
    },
    {
      type: "block_blast" as GameType,
      name: "Block Blast",
      description: "Match 3 or more blocks to score",
      icon: Blocks,
      color: "from-purple-500 to-pink-600",
      borderColor: "border-purple-500/30",
      bgColor: "bg-purple-500/10",
      image: "/images/games/block-blast.jpg"
    },
    {
      type: "car_racing" as GameType,
      name: "Car Racing",
      description: "Dodge obstacles and collect coins",
      icon: Car,
      color: "from-orange-500 to-red-600",
      borderColor: "border-orange-500/30",
      bgColor: "bg-orange-500/10",
      image: "/images/games/car-racing.jpg"
    },
    {
      type: "snake" as GameType,
      name: "Snake",
      description: "Eat food and grow without hitting walls",
      icon: Zap,
      color: "from-emerald-500 to-green-600",
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-500/10",
      image: "/images/games/snake.jpg"
    },
    {
      type: "memory" as GameType,
      name: "Memory Match",
      description: "Find matching pairs before time runs out",
      icon: Target,
      color: "from-amber-500 to-yellow-600",
      borderColor: "border-amber-500/30",
      bgColor: "bg-amber-500/10",
      image: "/images/games/memory.jpg"
    },
    {
      type: "flappy" as GameType,
      name: "Flappy Bird",
      description: "Fly through pipes and collect coins",
      icon: Trophy,
      color: "from-sky-500 to-indigo-600",
      borderColor: "border-sky-500/30",
      bgColor: "bg-sky-500/10",
      image: "/images/games/flappy.jpg"
    }
  ]

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
            Games
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Play fun games and earn 3 satoshis per game
          </p>
        </div>
        <Badge variant="secondary" className="w-fit text-sm py-1.5 px-3">
          <Coins className="h-4 w-4 mr-1.5 text-yellow-500" />
          {gameStatus.rewardPerGame} sats per game
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Games Today</p>
                <p className="text-lg font-bold">{gameStatus.gamesPlayedToday}/{gameStatus.maxGamesPerDay}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
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

        <Card className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Games Left</p>
                <p className="text-lg font-bold">{gameStatus.gamesRemaining}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cooldown</p>
                <p className="text-lg font-bold">
                  {countdown > 0 ? formatTime(countdown) : "Ready!"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
        <Card className="border-green-500/30 bg-green-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <p className="text-sm text-green-500">{success}</p>
          </CardContent>
        </Card>
      )}

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

      {/* Game Selection / Active Game */}
      {isPlaying && selectedGame ? (
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
              />
            )}
            {selectedGame === "block_blast" && (
              <BlockBlastGame 
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
              />
            )}
            {selectedGame === "car_racing" && (
              <CarRacingGame 
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
              />
            )}
            {selectedGame === "snake" && (
              <SnakeGame 
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
              />
            )}
            {selectedGame === "memory" && (
              <MemoryGame 
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
              />
            )}
            {selectedGame === "flappy" && (
              <FlappyGame 
                onGameEnd={handleGameEnd}
                onScoreUpdate={handleScoreUpdate}
                isActive={isPlaying}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Choose a Game</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
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
                  <Badge className="absolute top-3 right-3" variant="secondary">
                    <Coins className="h-3 w-3 mr-1 text-yellow-500" />
                    +3 sats
                  </Badge>
                </div>
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-lg">{game.name}</CardTitle>
                  <CardDescription className="text-sm">{game.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    className={cn(
                      "w-full transition-all",
                      !isLoading && gameStatus.canPlay && countdown <= 0 && gameStatus.gamesRemaining > 0 
                        ? `bg-gradient-to-r ${game.color} hover:opacity-90 text-white` 
                        : ""
                    )}
                    onClick={() => startGame(game.type)}
                    disabled={
                      isLoading || 
                      !gameStatus.canPlay || 
                      countdown > 0 || 
                      gameStatus.gamesRemaining <= 0
                    }
                  >
                    {isLoading ? (
                      <>
                        <Timer className="h-4 w-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : countdown > 0 ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Wait {formatTime(countdown)}
                      </>
                    ) : gameStatus.gamesRemaining <= 0 ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Daily Limit Reached
                      </>
                    ) : (
                      <>
                        <Gamepad2 className="h-4 w-4 mr-2" />
                        Play Now
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Games */}
      {gameStatus.recentGames.length > 0 && !isPlaying && (
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
                      <p className="font-medium text-sm">
                        {games.find(g => g.type === game.game_type)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score: {game.score.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    +{game.reward_satoshis} sats
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            Game Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Play games every {gameStatus.cooldownMinutes} minutes</li>
            <li>Earn {gameStatus.rewardPerGame} satoshis per completed game</li>
            <li>Maximum {gameStatus.maxGamesPerDay} games per day</li>
            <li>Games must be played legitimately - bots are not allowed</li>
            <li>Minimum play time required for rewards</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
