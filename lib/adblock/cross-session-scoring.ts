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
  } catch {}

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
  } catch {}
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
export function getCrossSessionProbability(): {
  probability: number
  confidence: number
  sessionCount: number
  hasBeenBlocked: boolean
  blockCount: number
} {
  const state = getCrossSessionState()

  // Base probability from cumulative score
  let probability = state.cumulativeScore / 100

  // Adjust based on session count (more sessions = more confidence)
  const sessionConfidence = Math.min(1, state.sessions.length / 5) // Max confidence at 5 sessions

  // Adjust based on block history
  if (state.persistentFlags.hasBeenBlocked) {
    // If previously blocked, increase probability
    probability = Math.min(1, probability + 0.2)

    // If blocked multiple times, further increase
    if (state.persistentFlags.blockCount >= 3) {
      probability = Math.min(1, probability + 0.1)
    }
  }

  // Check for recent blocking
  if (state.persistentFlags.lastBlockedAt) {
    const hoursSinceBlock = (Date.now() - new Date(state.persistentFlags.lastBlockedAt).getTime()) / (1000 * 60 * 60)
    if (hoursSinceBlock < 24) {
      probability = Math.min(1, probability + 0.15)
    }
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
export function shouldImmediatelyFlag(): boolean {
  const state = getCrossSessionState()

  // If blocked 3+ times with server verification, immediate flag
  if (state.persistentFlags.blockCount >= 3) {
    const verifiedBlocks = state.sessions.filter((s) => s.wasBlocked && s.serverVerified).length
    if (verifiedBlocks >= 2) {
      return true
    }
  }

  // If cumulative score is very high (90%+), immediate flag
  if (state.cumulativeScore >= 90 && state.sessions.length >= 3) {
    return true
  }

  return false
}

// Clear cross-session data (for debugging/testing)
export function clearCrossSessionData(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(CROSS_SESSION_KEY)
  } catch {}
}
