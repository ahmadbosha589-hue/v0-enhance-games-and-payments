// Centralized game engine with achievements, leaderboards, and rewards
import { create } from "zustand"

// ─── SINGLE SOURCE OF TRUTH FOR WIN CONDITIONS ──────────────────────────────
// These are the BASE thresholds at difficulty level 1.
// Both the status route and the complete route MUST import from here.
// The complete route applies the same difficulty scaling as the status route,
// so the client threshold and the server threshold are always identical.
export const BASE_WIN_THRESHOLDS: Record<string, number> = {
  tetris: 500,   // ~1-2 min of solid play
  block_blast: 300,
  car_racing: 450,
  snake: 500,    // Increased - requires more skill and time (~1-2 min)
  flappy: 20,
  memory: 120,
}

// Per-game minimum play durations (ms). Fast games like flappy/memory can
// legitimately end in 8 s; Tetris needs at least 15 s to reach threshold.
export const MIN_GAME_DURATIONS_MS: Record<string, number> = {
  tetris: 15000,
  block_blast: 12000,
  car_racing: 10000,
  snake: 30000,   // 30 seconds minimum to reach 500 points legitimately
  flappy: 8000,
  memory: 8000,
}

// Compute the difficulty-adjusted win threshold for a given game type and
// difficulty level (1-10).  Uses the same formula in both routes.
export function getAdjustedWinThreshold(gameType: string, difficultyLevel: number): number {
  const base = BASE_WIN_THRESHOLDS[gameType] ?? 100
  // +15% per level above 1, capped at level 10 (+135%)
  return Math.floor(base * (1 + (difficultyLevel - 1) * 0.15))
}
// ─────────────────────────────────────────────────────────────────────────────

export interface GameAchievement {
  id: string
  name: string
  description: string
  icon: string
  condition: (stats: GameStats) => boolean
  reward: number
  unlocked: boolean
}

export interface GameStats {
  totalGamesPlayed: number
  totalScore: number
  totalEarned: number
  highScores: Record<string, number>
  gamesPlayedToday: number
  currentStreak: number
  longestStreak: number
  lastPlayedAt: string | null
  achievements: string[]
  tetris: {
    linesCleared: number
    tetrises: number
    maxCombo: number
    maxLevel: number
  }
  snake: {
    maxLength: number
    totalFoodEaten: number
    perfectGames: number
  }
  memory: {
    perfectGames: number
    totalMatches: number
    fastestWin: number
  }
  flappy: {
    maxPipes: number
    totalCoins: number
    perfectRuns: number
  }
  car: {
    maxDistance: number
    totalCoins: number
    nearMisses: number
  }
  blockBlast: {
    maxCombo: number
    totalMatches: number
    specialBlocksUsed: number
  }
}

export interface TournamentInfo {
  id: string
  name: string
  gameType: string
  startTime: string
  endTime: string
  prizePool: number
  entryFee: number
  participants: number
  maxParticipants: number
  status: "upcoming" | "active" | "ended"
}

export const GAME_ACHIEVEMENTS: GameAchievement[] = [
  // General achievements
  {
    id: "first_game",
    name: "First Steps",
    description: "Play your first game",
    icon: "gamepad",
    condition: (stats) => stats.totalGamesPlayed >= 1,
    reward: 10,
    unlocked: false
  },
  {
    id: "century",
    name: "Century",
    description: "Play 100 games",
    icon: "trophy",
    condition: (stats) => stats.totalGamesPlayed >= 100,
    reward: 100,
    unlocked: false
  },
  {
    id: "high_roller",
    name: "High Roller",
    description: "Earn 1000 satoshis from games",
    icon: "coins",
    condition: (stats) => stats.totalEarned >= 1000,
    reward: 50,
    unlocked: false
  },
  {
    id: "streak_master",
    name: "Streak Master",
    description: "Play 7 days in a row",
    icon: "flame",
    condition: (stats) => stats.longestStreak >= 7,
    reward: 75,
    unlocked: false
  },
  {
    id: "daily_grinder",
    name: "Daily Grinder",
    description: "Max out daily games",
    icon: "calendar",
    condition: (stats) => stats.gamesPlayedToday >= 20,
    reward: 25,
    unlocked: false
  },
  // Tetris achievements
  {
    id: "tetris_master",
    name: "Tetris Master",
    description: "Get 10 Tetrises in a single game",
    icon: "grid",
    condition: (stats) => stats.tetris.tetrises >= 10,
    reward: 100,
    unlocked: false
  },
  {
    id: "line_clearer",
    name: "Line Clearer",
    description: "Clear 100 lines total",
    icon: "layers",
    condition: (stats) => stats.tetris.linesCleared >= 100,
    reward: 50,
    unlocked: false
  },
  {
    id: "combo_king",
    name: "Combo King",
    description: "Achieve a 10x combo in Tetris",
    icon: "zap",
    condition: (stats) => stats.tetris.maxCombo >= 10,
    reward: 75,
    unlocked: false
  },
  // Snake achievements
  {
    id: "snake_charmer",
    name: "Snake Charmer",
    description: "Reach length 50 in Snake",
    icon: "snake",
    condition: (stats) => stats.snake.maxLength >= 50,
    reward: 75,
    unlocked: false
  },
  {
    id: "perfect_snake",
    name: "Perfect Snake",
    description: "Complete a perfect game in Snake",
    icon: "star",
    condition: (stats) => stats.snake.perfectGames >= 1,
    reward: 100,
    unlocked: false
  },
  // Memory achievements
  {
    id: "photographic",
    name: "Photographic Memory",
    description: "Complete memory game without mistakes",
    icon: "brain",
    condition: (stats) => stats.memory.perfectGames >= 1,
    reward: 100,
    unlocked: false
  },
  {
    id: "speed_matcher",
    name: "Speed Matcher",
    description: "Complete memory game in under 60 seconds",
    icon: "timer",
    condition: (stats) => stats.memory.fastestWin > 0 && stats.memory.fastestWin <= 60,
    reward: 75,
    unlocked: false
  },
  // Flappy achievements
  {
    id: "sky_high",
    name: "Sky High",
    description: "Pass 50 pipes in Flappy Bird",
    icon: "bird",
    condition: (stats) => stats.flappy.maxPipes >= 50,
    reward: 100,
    unlocked: false
  },
  {
    id: "coin_collector",
    name: "Coin Collector",
    description: "Collect 100 coins in Flappy Bird",
    icon: "coins",
    condition: (stats) => stats.flappy.totalCoins >= 100,
    reward: 50,
    unlocked: false
  },
  // Car racing achievements
  {
    id: "road_warrior",
    name: "Road Warrior",
    description: "Drive 10000 meters total",
    icon: "car",
    condition: (stats) => stats.car.maxDistance >= 10000,
    reward: 75,
    unlocked: false
  },
  {
    id: "close_call",
    name: "Close Call",
    description: "Get 50 near misses",
    icon: "shield",
    condition: (stats) => stats.car.nearMisses >= 50,
    reward: 50,
    unlocked: false
  },
  // Block Blast achievements
  {
    id: "combo_crusher",
    name: "Combo Crusher",
    description: "Achieve a 15x combo in Block Blast",
    icon: "blocks",
    condition: (stats) => stats.blockBlast.maxCombo >= 15,
    reward: 100,
    unlocked: false
  },
  {
    id: "special_master",
    name: "Special Master",
    description: "Use 50 special blocks",
    icon: "sparkles",
    condition: (stats) => stats.blockBlast.specialBlocksUsed >= 50,
    reward: 75,
    unlocked: false
  }
]

export const DEFAULT_GAME_STATS: GameStats = {
  totalGamesPlayed: 0,
  totalScore: 0,
  totalEarned: 0,
  highScores: {},
  gamesPlayedToday: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedAt: null,
  achievements: [],
  tetris: {
    linesCleared: 0,
    tetrises: 0,
    maxCombo: 0,
    maxLevel: 0
  },
  snake: {
    maxLength: 0,
    totalFoodEaten: 0,
    perfectGames: 0
  },
  memory: {
    perfectGames: 0,
    totalMatches: 0,
    fastestWin: 0
  },
  flappy: {
    maxPipes: 0,
    totalCoins: 0,
    perfectRuns: 0
  },
  car: {
    maxDistance: 0,
    totalCoins: 0,
    nearMisses: 0
  },
  blockBlast: {
    maxCombo: 0,
    totalMatches: 0,
    specialBlocksUsed: 0
  }
}

// Reward multipliers based on score
export function calculateReward(baseReward: number, score: number, gameType: string): number {
  const scoreMultipliers: Record<string, { threshold: number; multiplier: number }[]> = {
    tetris: [
      { threshold: 5000, multiplier: 1.5 },
      { threshold: 10000, multiplier: 2.0 },
      { threshold: 20000, multiplier: 2.5 }
    ],
    snake: [
      { threshold: 500, multiplier: 1.5 },
      { threshold: 1000, multiplier: 2.0 },
      { threshold: 2000, multiplier: 2.5 }
    ],
    memory: [
      { threshold: 1000, multiplier: 1.5 },
      { threshold: 2000, multiplier: 2.0 },
      { threshold: 3000, multiplier: 2.5 }
    ],
    flappy: [
      { threshold: 200, multiplier: 1.5 },
      { threshold: 500, multiplier: 2.0 },
      { threshold: 1000, multiplier: 2.5 }
    ],
    car_racing: [
      { threshold: 1000, multiplier: 1.5 },
      { threshold: 2500, multiplier: 2.0 },
      { threshold: 5000, multiplier: 2.5 }
    ],
    block_blast: [
      { threshold: 1000, multiplier: 1.5 },
      { threshold: 2500, multiplier: 2.0 },
      { threshold: 5000, multiplier: 2.5 }
    ]
  }

  const multipliers = scoreMultipliers[gameType] || []
  let multiplier = 1.0

  for (const tier of multipliers) {
    if (score >= tier.threshold) {
      multiplier = tier.multiplier
    }
  }

  return Math.floor(baseReward * multiplier)
}

// Daily bonus calculation
export function calculateDailyBonus(streak: number): number {
  const bonuses = [0, 5, 10, 15, 20, 30, 40, 50]
  return bonuses[Math.min(streak, bonuses.length - 1)]
}

// Check and update streak
export function updateStreak(lastPlayedAt: string | null): { currentStreak: number; isNewDay: boolean } {
  const now = new Date()
  const today = now.toDateString()

  if (!lastPlayedAt) {
    return { currentStreak: 1, isNewDay: true }
  }

  const lastPlayed = new Date(lastPlayedAt)
  const lastPlayedDate = lastPlayed.toDateString()

  if (lastPlayedDate === today) {
    return { currentStreak: 0, isNewDay: false } // Same day, streak continues
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (lastPlayedDate === yesterday.toDateString()) {
    return { currentStreak: 1, isNewDay: true } // Consecutive day
  }

  return { currentStreak: 1, isNewDay: true } // Streak broken, start fresh
}

// Tournament mock data generator - simulates real tournaments
// In production, these would come from a tournaments database table
export function generateMockTournaments(): TournamentInfo[] {
  const now = new Date()

  // Generate realistic-looking tournaments based on current time
  const hour = now.getHours()
  const dayOfWeek = now.getDay()

  // Active tournament during peak hours (12-22)
  const isActiveTournament = hour >= 12 && hour <= 22

  // Generate semi-random but consistent participant counts based on time
  const baseParticipants = Math.floor((hour + dayOfWeek * 3) % 50) + 20

  return [
    {
      id: `t-${Date.now()}-1`,
      name: "Tetris Championship",
      gameType: "tetris",
      startTime: isActiveTournament
        ? new Date(now.getTime() - 1800000).toISOString()
        : new Date(now.getTime() + 3600000).toISOString(),
      endTime: isActiveTournament
        ? new Date(now.getTime() + 5400000).toISOString()
        : new Date(now.getTime() + 7200000).toISOString(),
      prizePool: 5000,
      entryFee: 50,
      participants: Math.min(baseParticipants + 25, 100),
      maxParticipants: 100,
      status: isActiveTournament ? "active" : "upcoming"
    },
    {
      id: `t-${Date.now()}-2`,
      name: "Snake Sprint",
      gameType: "snake",
      startTime: new Date(now.getTime() + 7200000).toISOString(),
      endTime: new Date(now.getTime() + 14400000).toISOString(),
      prizePool: 3000,
      entryFee: 30,
      participants: Math.min(baseParticipants + 10, 50),
      maxParticipants: 50,
      status: "upcoming"
    },
    {
      id: `t-${Date.now()}-3`,
      name: "Memory Masters",
      gameType: "memory",
      startTime: new Date(now.getTime() + 86400000).toISOString(),
      endTime: new Date(now.getTime() + 90000000).toISOString(),
      prizePool: 2500,
      entryFee: 25,
      participants: Math.min(baseParticipants, 50),
      maxParticipants: 50,
      status: "upcoming"
    }
  ]
}

// Difficulty system - games get progressively harder based on TODAY's play count
// RESETS TO EASY (LEVEL 1) EVERY 24 HOURS
export interface DifficultySettings {
  level: number // 1-10
  speedMultiplier: number // 1.0 - 2.0
  obstacleFrequency: number // 1.0 - 2.5
  bonusChance: number // 0.15 - 0.03 (stricter - decreases)
  scoreMultiplier: number // 1.0 - 1.2 (smaller reward bonus)
  description: string
  resetsIn: string // Time until daily reset
}

// Calculate difficulty based on TODAY's games played only (resets every 24 hours at midnight UTC)
export function calculateDifficulty(gamesTodayPlayed: number): DifficultySettings {
  // Difficulty increases every 2 games today, maxing at level 10 (20 games)
  // Resets daily to level 1 (easy) at midnight UTC
  const level = Math.min(10, Math.floor(gamesTodayPlayed / 2) + 1)

  // Linear progression for difficulty factors
  const progress = (level - 1) / 9 // 0 to 1

  // Calculate time until next reset (midnight UTC)
  const now = new Date()
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const msUntilReset = tomorrow.getTime() - now.getTime()
  const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60))
  const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60))

  return {
    level,
    speedMultiplier: 1.0 + (progress * 1.0), // 1.0 to 2.0
    obstacleFrequency: 1.0 + (progress * 1.5), // 1.0 to 2.5
    bonusChance: 0.15 - (progress * 0.12), // 0.15 to 0.03 (much stricter bonuses)
    scoreMultiplier: 1.0 + (progress * 0.2), // 1.0 to 1.2 (smaller bonus)
    description: getDifficultyDescription(level),
    resetsIn: `${hoursUntilReset}h ${minutesUntilReset}m`
  }
}

function getDifficultyDescription(level: number): string {
  const descriptions = [
    "Beginner",
    "Easy",
    "Normal",
    "Moderate",
    "Challenging",
    "Hard",
    "Very Hard",
    "Expert",
    "Master",
    "Legendary"
  ]
  return descriptions[level - 1] || "Unknown"
}

// Get difficulty color for UI
export function getDifficultyColor(level: number): string {
  if (level <= 2) return "text-green-500"
  if (level <= 4) return "text-yellow-500"
  if (level <= 6) return "text-orange-500"
  if (level <= 8) return "text-red-500"
  return "text-purple-500"
}

// Leaderboard entry type
export interface LeaderboardEntry {
  rank: number
  username: string
  score: number
  avatar?: string
  isCurrent?: boolean
}

// Generate leaderboard data - uses realistic scores based on game type
// In production, this would fetch from a game_leaderboards database table
export function generateMockLeaderboard(gameType: string, userScore?: number): LeaderboardEntry[] {
  // Use game-appropriate usernames
  const names = [
    "CryptoMaster", "BlockChamp", "SatoshiPro", "BitcoinKing", "HashMaster",
    "ChainPlayer", "NodeRunner", "CoinHunter", "TokenPro", "WalletKing",
    "CryptoNinja", "KeyHolder", "LedgerPro", "P2PGamer", "DeFiMaster"
  ]

  // Realistic score ranges for each game based on actual gameplay
  const scoreRanges: Record<string, { top: number; dropoff: number }> = {
    tetris: { top: 8000, dropoff: 0.08 },      // Top score ~8000, steady dropoff
    snake: { top: 1500, dropoff: 0.1 },        // Top score ~1500
    memory: { top: 3000, dropoff: 0.07 },      // Top score ~3000
    flappy: { top: 150, dropoff: 0.12 },       // Top score ~150 (pipes passed)
    car_racing: { top: 4000, dropoff: 0.09 },  // Top score ~4000
    block_blast: { top: 3500, dropoff: 0.08 }  // Top score ~3500
  }

  const range = scoreRanges[gameType] || { top: 5000, dropoff: 0.1 }

  // Generate consistent but varying scores
  const entries: LeaderboardEntry[] = Array.from({ length: 15 }, (_, i) => {
    // Exponential dropoff for more realistic distribution
    const scoreMultiplier = Math.pow(1 - range.dropoff, i)
    const variance = range.top * 0.05 * (Math.sin(i * 1.5) + 0.5) // Small consistent variance
    const score = Math.floor(range.top * scoreMultiplier + variance)

    return {
      rank: i + 1,
      username: names[i],
      score: Math.max(10, score),
      isCurrent: false
    }
  })

  // Sort by score descending (should already be sorted, but ensure it)
  entries.sort((a, b) => b.score - a.score)

  // Update ranks
  entries.forEach((entry, i) => {
    entry.rank = i + 1
  })

  // Insert user if score provided
  if (userScore && userScore > 0) {
    const userEntry: LeaderboardEntry = {
      rank: 0,
      username: "You",
      score: userScore,
      isCurrent: true
    }

    // Find position based on score
    let inserted = false
    for (let i = 0; i < entries.length; i++) {
      if (userScore > entries[i].score) {
        entries.splice(i, 0, userEntry)
        inserted = true
        break
      }
    }
    if (!inserted) {
      entries.push(userEntry)
    }

    // Update ranks
    entries.forEach((entry, i) => {
      entry.rank = i + 1
    })

    // Keep only top 15 + user if user is beyond that
    const userIndex = entries.findIndex(e => e.isCurrent)
    if (userIndex > 14) {
      return [...entries.slice(0, 14), entries[userIndex]]
    }
    return entries.slice(0, 15)
  }

  return entries
}
