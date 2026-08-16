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
  // v13.0: dual-channel cross-window sync.
  //   1) BroadcastChannel — instant, low-latency, same-origin (preferred).
  //   2) localStorage `storage` event — fallback for older browsers and
  //      cross-window persistence even when the BroadcastChannel isn't
  //      available. Both must be wired so a flagged status that's set in
  //      one window/iframe immediately reflects in every other open tab.
  const unsubscribers: Array<() => void> = []

  const channel = getBroadcastChannel()
  if (channel) {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "adblock_state_update") {
        callback(event.data.state)
      }
    }
    channel.addEventListener("message", handler)
    unsubscribers.push(() => channel.removeEventListener("message", handler))
  }

  if (typeof window !== "undefined") {
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== BACKUP_KEY || !event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue)
        const migrated = migrateState(parsed)
        callback(migrated)
      } catch {}
    }
    window.addEventListener("storage", storageHandler)
    unsubscribers.push(() => window.removeEventListener("storage", storageHandler))
  }

  return () => {
    for (const fn of unsubscribers) fn()
  }
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
    // v13.0 PERSISTENCE STRATEGY:
    //   1. Prefer the most-recently-written FLAGGED state across both stores
    //      — this means once flagged, neither closing the tab, clearing
    //      sessionStorage, nor opening a new tab can drop the flag.
    //   2. Fall back to whichever store has data otherwise.
    //   3. Default state if neither store has anything.
    const session = sessionStorage.getItem(STORAGE_KEY)
    const local = localStorage.getItem(BACKUP_KEY)

    const parsedSession = session ? safeParse(session) : null
    const parsedLocal = local ? safeParse(local) : null

    const sessionFlagged = parsedSession && parsedSession.isFlagged
    const localFlagged = parsedLocal && parsedLocal.isFlagged

    // If localStorage has a flagged record, ALWAYS honor it (persistence
    // takes priority over a stale-cleared sessionStorage).
    let chosen: any = null
    if (localFlagged) {
      chosen = parsedLocal
    } else if (sessionFlagged) {
      chosen = parsedSession
    } else {
      chosen = parsedSession || parsedLocal
    }

    if (chosen) {
      const migrated = migrateState(chosen)

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

function safeParse(s: string): any | null {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
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

    // v13.0: dual-write to BOTH stores so persistence is symmetric.
    // sessionStorage = fast intra-tab cache.
    // localStorage   = durable, survives tab close, browser restart,
    //                  cross-window sync via storage events.
    try { sessionStorage.setItem(STORAGE_KEY, serialized) } catch {}
    try { localStorage.setItem(BACKUP_KEY, serialized) } catch {}

    // Sync across tabs (BroadcastChannel for same-origin tabs)
    broadcastStateUpdate(newState)
  } catch {}
}

// v13.0: Apply server-persisted flag back into client storage. Called by the
// AdblockProvider on mount after fetching /api/adblock/status. This is the
// mechanism that re-flags a user whose previous tab/session was cleared but
// who is still flagged in the database.
export function hydrateFromServer(payload: {
  isFlagged: boolean
  confidence?: number
  blockerType?: string | null
  methods?: string[]
  serverVerified?: boolean
  detectedAt?: string | null
}): void {
  if (!payload.isFlagged) return
  setAdblockSessionState({
    isFlagged: true,
    isBlocked: true,
    confidence: payload.confidence ?? 100,
    blockerType: payload.blockerType ?? null,
    methods: payload.methods ?? [],
    serverVerified: payload.serverVerified ?? true,
    detectedAt: payload.detectedAt ?? new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  })
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

// =============================================================================
// v17.0 — SELF-HEALING (FALSE POSITIVE RECOVERY)
// =============================================================================
//
// When the detection cycle observes a "definitively clean" page (all controls
// visible, zero baits hidden, no fetches blocked, no DNS blocks) while the
// session/server flag is still set, we have evidence the flag was stale or a
// false positive. After N consecutive clean cycles, the hook calls
// `markSelfHealed()` and the local + server flags are cleared.
//
// Subsequent server hydrations within `SELF_HEAL_WINDOW_MS` are suppressed so
// the just-cleared server flag doesn't flap the modal back into view.
// =============================================================================

const SELF_HEAL_KEY = "__adblock_self_healed_at"
/** How long (ms) to suppress server re-hydration after a successful self-heal */
export const SELF_HEAL_WINDOW_MS = 5 * 60 * 1000 // 5 minutes — long enough for server to settle

export function markSelfHealed(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SELF_HEAL_KEY, Date.now().toString())
  } catch {}
  // Clear all local flag state and broadcast the cleared state so every tab
  // and the AdblockProvider drop the modal immediately.
  clearAllAdblockState()
}

export function wasRecentlySelfHealed(windowMs: number = SELF_HEAL_WINDOW_MS): boolean {
  if (typeof window === "undefined") return false
  try {
    const v = localStorage.getItem(SELF_HEAL_KEY)
    if (!v) return false
    const ts = Number.parseInt(v, 10)
    if (Number.isNaN(ts)) return false
    if (Date.now() - ts < windowMs) return true
    // Expired — clean up
    localStorage.removeItem(SELF_HEAL_KEY)
  } catch {}
  return false
}

export function clearSelfHealedMark(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(SELF_HEAL_KEY)
  } catch {}
}
