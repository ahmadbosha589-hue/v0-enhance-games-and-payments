// Enterprise-Grade Session Store with Tamper Detection
import { generateChecksum, type DetectionSignal } from "./detection-engine"

const STORAGE_KEY = "__adblock_session_state_v2"
const BACKUP_KEY = "__adblock_backup_state"
const BROADCAST_CHANNEL = "adblock_detection_sync"
const STATE_VERSION = 2

export interface AdblockSessionState {
  version: number
  isFlagged: boolean
  isBlocked: boolean
  detectedAt: string | null
  blockerType: string | null
  confidence: number
  methods: string[]
  consecutiveDetections: number
  signals: DetectionSignal[]
  serverVerified: boolean
  lastVerifiedAt: string | null
  networkBaseline: {
    avgLatency: number
    stdDeviation: number
    sampleCount: number
  }
  detectionHistory: Array<{
    timestamp: number
    confidence: number
    methodCount: number
  }>
  checksum: string
}

const defaultState: AdblockSessionState = {
  version: STATE_VERSION,
  isFlagged: false,
  isBlocked: false,
  detectedAt: null,
  blockerType: null,
  confidence: 0,
  methods: [],
  consecutiveDetections: 0,
  signals: [],
  serverVerified: false,
  lastVerifiedAt: null,
  networkBaseline: {
    avgLatency: 0,
    stdDeviation: 0,
    sampleCount: 0,
  },
  detectionHistory: [],
  checksum: "",
}

// Generate checksum for state integrity
function generateStateChecksum(state: Omit<AdblockSessionState, "checksum">): string {
  const data = JSON.stringify({
    isFlagged: state.isFlagged,
    isBlocked: state.isBlocked,
    confidence: state.confidence,
    consecutiveDetections: state.consecutiveDetections,
    serverVerified: state.serverVerified,
  })
  return generateChecksum(data)
}

// Verify state hasn't been tampered with
function verifyStateIntegrity(state: AdblockSessionState): boolean {
  const { checksum, ...stateWithoutChecksum } = state
  const expectedChecksum = generateStateChecksum(stateWithoutChecksum)
  return checksum === expectedChecksum
}

// Migrate old state versions
function migrateState(state: any): AdblockSessionState {
  if (!state.version || state.version < STATE_VERSION) {
    return {
      ...defaultState,
      isFlagged: state.isFlagged || false,
      isBlocked: state.isBlocked || false,
      detectedAt: state.detectedAt || null,
      blockerType: state.blockerType || null,
      confidence: state.confidence || 0,
      methods: state.methods || [],
    }
  }
  return state
}

// Cross-tab synchronization
let broadcastChannel: BroadcastChannel | null = null

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null
  if (!broadcastChannel && typeof BroadcastChannel !== "undefined") {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL)
    } catch {}
  }
  return broadcastChannel
}

export function subscribeToCrossTabUpdates(callback: (state: AdblockSessionState) => void): () => void {
  const channel = getBroadcastChannel()
  if (!channel) return () => {}

  const handler = (event: MessageEvent) => {
    if (event.data?.type === "adblock_state_update") {
      callback(event.data.state)
    }
  }

  channel.addEventListener("message", handler)
  return () => channel.removeEventListener("message", handler)
}

function broadcastStateUpdate(state: AdblockSessionState): void {
  const channel = getBroadcastChannel()
  if (channel) {
    try {
      channel.postMessage({ type: "adblock_state_update", state })
    } catch {}
  }
}

export function getAdblockSessionState(): AdblockSessionState {
  if (typeof window === "undefined") return defaultState

  try {
    // Try primary storage
    let stored = sessionStorage.getItem(STORAGE_KEY)

    // Fallback to backup if primary is missing/corrupted
    if (!stored) {
      stored = localStorage.getItem(BACKUP_KEY)
    }

    if (stored) {
      const parsed = JSON.parse(stored)
      const migrated = migrateState(parsed)

      // Verify integrity - if tampered, return flagged state (assume blocking)
      if (migrated.isFlagged && !verifyStateIntegrity(migrated)) {
        console.warn("[Adblock] State tampering detected, maintaining flagged status")
        return { ...migrated, isFlagged: true, isBlocked: true }
      }

      return migrated
    }
  } catch {}

  return defaultState
}

export function setAdblockSessionState(state: Partial<AdblockSessionState>): void {
  if (typeof window === "undefined") return

  try {
    const current = getAdblockSessionState()
    const newState: AdblockSessionState = {
      ...current,
      ...state,
      version: STATE_VERSION,
      checksum: "", // Will be set below
    }

    // Generate checksum for integrity
    const { checksum: _, ...stateForChecksum } = newState
    newState.checksum = generateStateChecksum(stateForChecksum)

    const serialized = JSON.stringify(newState)

    // Store in both session and local storage for persistence
    sessionStorage.setItem(STORAGE_KEY, serialized)

    // Backup flagged state to localStorage (survives session close)
    if (newState.isFlagged) {
      localStorage.setItem(BACKUP_KEY, serialized)
    }

    // Sync across tabs
    broadcastStateUpdate(newState)
  } catch {}
}

export function clearAdblockSessionState(): void {
  if (typeof window === "undefined") return

  try {
    sessionStorage.removeItem(STORAGE_KEY)
    // Note: We don't clear localStorage backup - once flagged, stays flagged
  } catch {}
}

export function clearAllAdblockState(): void {
  if (typeof window === "undefined") return

  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(BACKUP_KEY)

    // Broadcast cleared state to other tabs
    broadcastStateUpdate(defaultState)
  } catch {}
}

export function allowRecheckWithoutSessionBlock(): void {
  if (typeof window === "undefined") return

  try {
    // Set a temporary flag that bypasses session check for next detection
    sessionStorage.setItem("__adblock_recheck_bypass", "true")
  } catch {}
}

export function shouldBypassSessionCheck(): boolean {
  if (typeof window === "undefined") return false

  try {
    const bypass = sessionStorage.getItem("__adblock_recheck_bypass")
    if (bypass === "true") {
      sessionStorage.removeItem("__adblock_recheck_bypass")
      return true
    }
  } catch {}
  return false
}

export function flagUserInSession(
  blockerType: string | null,
  confidence: number,
  methods: string[],
  signals: DetectionSignal[],
  serverVerified: boolean,
): void {
  setAdblockSessionState({
    isFlagged: true,
    isBlocked: true,
    detectedAt: new Date().toISOString(),
    blockerType,
    confidence,
    methods,
    signals,
    serverVerified,
    lastVerifiedAt: serverVerified ? new Date().toISOString() : null,
  })
}

export function updateDetectionHistory(confidence: number, methodCount: number): void {
  const state = getAdblockSessionState()
  const history = [...state.detectionHistory]

  // Keep last 20 detection events
  if (history.length >= 20) {
    history.shift()
  }

  history.push({
    timestamp: Date.now(),
    confidence,
    methodCount,
  })

  setAdblockSessionState({ detectionHistory: history })
}

export function updateNetworkBaseline(latency: number): void {
  const state = getAdblockSessionState()
  const baseline = state.networkBaseline

  const newSampleCount = baseline.sampleCount + 1
  const newAvgLatency = (baseline.avgLatency * baseline.sampleCount + latency) / newSampleCount

  // Calculate running standard deviation
  let newStdDev = baseline.stdDeviation
  if (newSampleCount > 1) {
    const variance =
      (baseline.stdDeviation ** 2 * (baseline.sampleCount - 1) + (latency - newAvgLatency) ** 2) / (newSampleCount - 1)
    newStdDev = Math.sqrt(variance)
  }

  setAdblockSessionState({
    networkBaseline: {
      avgLatency: newAvgLatency,
      stdDeviation: newStdDev,
      sampleCount: Math.min(newSampleCount, 100), // Cap at 100 samples
    },
  })
}

export function incrementConsecutiveDetections(): number {
  const state = getAdblockSessionState()
  const newCount = state.consecutiveDetections + 1
  setAdblockSessionState({ consecutiveDetections: newCount })
  return newCount
}

export function resetConsecutiveDetections(): void {
  setAdblockSessionState({ consecutiveDetections: 0 })
}

export function isUserBlockedInSession(): boolean {
  if (typeof window !== "undefined") {
    try {
      const disabledAt = localStorage.getItem("__adblock_disabled_at")
      if (disabledAt) {
        const timestamp = Number.parseInt(disabledAt, 10)
        // 60 second grace period
        if (Date.now() - timestamp < 60000) {
          return false
        }
      }
    } catch {}
  }

  const state = getAdblockSessionState()
  return state.isFlagged || state.isBlocked
}

export function getDetectionConfidence(): number {
  return getAdblockSessionState().confidence
}

export function isServerVerified(): boolean {
  return getAdblockSessionState().serverVerified
}

// Apply confidence decay over time (reduces false positive persistence)
export function applyConfidenceDecay(): void {
  const state = getAdblockSessionState()

  if (!state.isFlagged || state.confidence <= 0) return

  const lastDetected = state.detectedAt ? new Date(state.detectedAt).getTime() : Date.now()
  const hoursSinceDetection = (Date.now() - lastDetected) / (1000 * 60 * 60)

  // Decay 5% per hour, but never below 30% if server verified
  const decayRate = 0.05
  const minConfidence = state.serverVerified ? 30 : 10
  const decayedConfidence = Math.max(minConfidence, state.confidence * (1 - decayRate * hoursSinceDetection))

  if (decayedConfidence < state.confidence) {
    setAdblockSessionState({ confidence: decayedConfidence })
  }
}

export function isInGracePeriod(): boolean {
  if (typeof window === "undefined") return false

  try {
    const disabledAt = localStorage.getItem("__adblock_disabled_at")
    if (disabledAt) {
      const timestamp = Number.parseInt(disabledAt, 10)
      if (Date.now() - timestamp < 60000) {
        return true
      }
      // Grace period expired, clear it
      localStorage.removeItem("__adblock_disabled_at")
    }
  } catch {}
  return false
}

export function setGracePeriod(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem("__adblock_disabled_at", Date.now().toString())
    // Also clear the flagged state when setting grace period
    clearAllAdblockState()
  } catch {}
}

export function clearGracePeriod(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem("__adblock_disabled_at")
  } catch {}
}
