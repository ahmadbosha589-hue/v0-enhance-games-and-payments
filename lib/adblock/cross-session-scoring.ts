// =============================================================================
// CROSS-SESSION PROBABILISTIC SCORING
// Maintains detection confidence across multiple sessions
// =============================================================================

const CROSS_SESSION_KEY = "__adblock_cross_session_v1"
const MAX_SESSIONS = 10
const CONFIDENCE_DECAY_RATE = 0.1 // 10% decay per session

export interface SessionScore {
  sessionId: string
  timestamp: number
  confidence: number
  methodCount: number
  signals: string[]
  wasBlocked: boolean
  serverVerified: boolean
}

export interface CrossSessionState {
  userId: string
  sessions: SessionScore[]
  cumulativeScore: number
  totalSessions: number
  lastUpdated: number
  persistentFlags: {
    hasBeenBlocked: boolean
    firstBlockedAt: string | null
    blockCount: number
    lastBlockedAt: string | null
  }
}

// Generate a persistent user identifier (fingerprint-based)
function generatePersistentUserId(): string {
  if (typeof window === "undefined") return "server"

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    // @ts-ignore
    navigator.deviceMemory || 0,
  ]

  const fingerprint = components.join("|")

  // Simple hash function
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }

  return `user_${Math.abs(hash).toString(36)}`
}

// Get cross-session state from localStorage
export function getCrossSessionState(): CrossSessionState {
  if (typeof window === "undefined") {
    return createDefaultState()
  }

  try {
    const stored = localStorage.getItem(CROSS_SESSION_KEY)
    if (stored) {
      const state = JSON.parse(stored) as CrossSessionState

      // Verify user ID matches (prevent state hijacking)
      const currentUserId = generatePersistentUserId()
      if (state.userId !== currentUserId) {
        // Different user/device - create new state but inherit block history
        return {
          ...createDefaultState(),
          persistentFlags: state.persistentFlags,
        }
      }

      return state
    }
  } catch { }

  return createDefaultState()
}

function createDefaultState(): CrossSessionState {
  return {
    userId: generatePersistentUserId(),
    sessions: [],
    cumulativeScore: 0,
    totalSessions: 0,
    lastUpdated: Date.now(),
    persistentFlags: {
      hasBeenBlocked: false,
      firstBlockedAt: null,
      blockCount: 0,
      lastBlockedAt: null,
    },
  }
}

// Save cross-session state
function saveCrossSessionState(state: CrossSessionState): void {
  if (typeof window === "undefined") return

  try {
    state.lastUpdated = Date.now()
    localStorage.setItem(CROSS_SESSION_KEY, JSON.stringify(state))
  } catch { }
}

// Record a detection session
export function recordDetectionSession(
  confidence: number,
  methodCount: number,
  signals: string[],
  wasBlocked: boolean,
  serverVerified: boolean,
): void {
  const state = getCrossSessionState()

  const sessionScore: SessionScore = {
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    confidence,
    methodCount,
    signals,
    wasBlocked,
    serverVerified,
  }

  // Add new session
  state.sessions.push(sessionScore)

  // Keep only last N sessions
  if (state.sessions.length > MAX_SESSIONS) {
    state.sessions = state.sessions.slice(-MAX_SESSIONS)
  }

  // Update cumulative score with decay
  state.cumulativeScore = calculateCumulativeScore(state.sessions)
  state.totalSessions++

  // Update persistent flags if blocked
  if (wasBlocked) {
    state.persistentFlags.hasBeenBlocked = true
    state.persistentFlags.blockCount++
    state.persistentFlags.lastBlockedAt = new Date().toISOString()

    if (!state.persistentFlags.firstBlockedAt) {
      state.persistentFlags.firstBlockedAt = new Date().toISOString()
    }
  }

  saveCrossSessionState(state)
}

// Calculate cumulative score with exponential decay
function calculateCumulativeScore(sessions: SessionScore[]): number {
  if (sessions.length === 0) return 0

  let weightedSum = 0
  let totalWeight = 0

  // Most recent sessions have higher weight
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const recency = i / sessions.length // 0 = oldest, 1 = newest
    const weight = Math.pow(1 - CONFIDENCE_DECAY_RATE, sessions.length - 1 - i)

    // Server-verified sessions get bonus weight
    const verificationBonus = session.serverVerified ? 1.3 : 1

    weightedSum += session.confidence * weight * verificationBonus
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0
}

// Get the probabilistic blocking probability based on history
// v8.0: Made much more conservative to reduce false positives
export function getCrossSessionProbability(): {
  probability: number
  confidence: number
  sessionCount: number
  hasBeenBlocked: boolean
  blockCount: number
} {
  const state = getCrossSessionState()

  // Base probability from cumulative score - scaled down
  let probability = (state.cumulativeScore / 100) * 0.8 // Scale down base probability

  // Only count server-verified sessions for probability boost
  const verifiedSessions = state.sessions.filter(s => s.serverVerified)
  const sessionConfidence = Math.min(1, verifiedSessions.length / 7) // Max confidence at 7 verified sessions (was 5)

  // Apply session confidence as a multiplier
  probability = probability * sessionConfidence

  // Only boost if blocked with server verification
  if (state.persistentFlags.hasBeenBlocked) {
    const verifiedBlockCount = state.sessions.filter(s => s.wasBlocked && s.serverVerified).length

    // Only increase if we have verified blocks
    if (verifiedBlockCount >= 2) {
      probability = Math.min(1, probability + 0.1) // Reduced from 0.2
    }

    // If blocked many times with verification, further increase
    if (verifiedBlockCount >= 4) {
      probability = Math.min(1, probability + 0.1)
    }
  }

  // Check for recent verified blocking (not just any blocking)
  const recentVerifiedBlocks = state.sessions.filter(s => {
    if (!s.wasBlocked || !s.serverVerified) return false
    const hoursSinceBlock = (Date.now() - s.timestamp) / (1000 * 60 * 60)
    return hoursSinceBlock < 24
  })

  if (recentVerifiedBlocks.length >= 2) {
    probability = Math.min(1, probability + 0.1)
  }

  return {
    probability: Math.min(1, Math.max(0, probability)),
    confidence: state.cumulativeScore,
    sessionCount: state.totalSessions,
    hasBeenBlocked: state.persistentFlags.hasBeenBlocked,
    blockCount: state.persistentFlags.blockCount,
  }
}

// Check if user should be immediately flagged based on history
// v8.0: Made MUCH stricter to reduce false positives
export function shouldImmediatelyFlag(): boolean {
  const state = getCrossSessionState()

  // If blocked 5+ times with server verification, immediate flag (was 3)
  if (state.persistentFlags.blockCount >= 5) {
    const verifiedBlocks = state.sessions.filter((s) => s.wasBlocked && s.serverVerified).length
    // Require 4 verified blocks (was 2)
    if (verifiedBlocks >= 4) {
      return true
    }
  }

  // If cumulative score is extremely high (95%+) with many sessions, immediate flag
  // Was 90% with 3 sessions - now requires more evidence
  if (state.cumulativeScore >= 95 && state.sessions.length >= 5) {
    return true
  }

  return false
}

// Clear cross-session data (for debugging/testing)
export function clearCrossSessionData(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(CROSS_SESSION_KEY)
  } catch { }
}
