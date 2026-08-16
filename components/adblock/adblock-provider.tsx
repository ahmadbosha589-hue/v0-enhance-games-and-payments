"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { AdblockWarningModal } from "./adblock-warning-modal"
import {
  getAdblockSessionState,
  subscribeToCrossTabUpdates,
  hydrateFromServer,
  wasRecentlySelfHealed,
  type AdblockSessionState,
} from "@/lib/adblock/session-store"
import type { DetectionSignal } from "@/lib/adblock/detection-engine"

// =============================================================================
// ENTERPRISE-GRADE ADBLOCK CONTEXT PROVIDER
// =============================================================================

interface AdblockContextType {
  // Core state
  isFlagged: boolean
  isBlocked: boolean
  confidence: number
  consecutiveDetections: number
  serverVerified: boolean

  // Detection info
  blockerType: string | null
  detectionMethods: string[]
  signals: DetectionSignal[]

  // Actions
  setFlagged: (
    blockerType: string | null,
    confidence: number,
    methods: string[],
    signals: DetectionSignal[],
    serverVerified: boolean,
  ) => void
  checkBlockStatus: () => boolean
  getDetectionState: () => AdblockSessionState

  // Appeal mechanism for false positives
  requestAppeal: () => Promise<boolean>
}

const AdblockContext = createContext<AdblockContextType>({
  isFlagged: false,
  isBlocked: false,
  confidence: 0,
  consecutiveDetections: 0,
  serverVerified: false,
  blockerType: null,
  detectionMethods: [],
  signals: [],
  setFlagged: () => {},
  checkBlockStatus: () => false,
  getDetectionState: () => ({}) as AdblockSessionState,
  requestAppeal: async () => false,
})

export const useAdblock = () => useContext(AdblockContext)

interface AdblockProviderProps {
  children: ReactNode
  userId: string
  warningDurationSeconds?: number
}

export function AdblockProvider({ children, userId, warningDurationSeconds = 60 }: AdblockProviderProps) {
  // Core state
  const [isFlagged, setIsFlagged] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [consecutiveDetections, setConsecutiveDetections] = useState(0)
  const [serverVerified, setServerVerified] = useState(false)

  // Detection info
  const [blockerType, setBlockerType] = useState<string | null>(null)
  const [detectionMethods, setDetectionMethods] = useState<string[]>([])
  const [signals, setSignals] = useState<DetectionSignal[]>([])

  // Load persisted state on mount
  useEffect(() => {
    const state = getAdblockSessionState()

    if (state.isFlagged) {
      setIsFlagged(true)
      setIsBlocked(state.isBlocked)
      setConfidence(state.confidence)
      setConsecutiveDetections(state.consecutiveDetections)
      setServerVerified(state.serverVerified)
      setBlockerType(state.blockerType)
      setDetectionMethods(state.methods)
      setSignals(state.signals || [])
    }
  }, [])

  // v13.0: SERVER-SIDE PERSISTENT FLAG HYDRATION
  // On every mount we ask the server whether this user is persistently flagged
  // (via the `profiles` table and `fraud_flags`). If so we restore the modal
  // immediately — even if the user cleared their browser data, opened a new
  // tab, switched browsers, or signed in on a new device. This is what makes
  // the anti-adblock truly persistent across the account's lifetime.
  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()

    async function hydrate() {
      // v17.0 SELF-HEAL GUARD — if the client just observed multiple clean
      // detection cycles and successfully called /api/adblock/clear, we must
      // NOT immediately re-flag from a stale /api/adblock/status response.
      // The server takes a moment to finalize the clear (multi-row UPDATE
      // + audit insert), so we suppress hydration for SELF_HEAL_WINDOW_MS.
      if (wasRecentlySelfHealed()) return
      try {
        const res = await fetch("/api/adblock/status", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        // Re-check the self-heal flag after the network round-trip — a
        // self-heal could have happened concurrently while we were awaiting.
        if (wasRecentlySelfHealed()) return
        if (data?.isFlagged) {
          // Mirror into the client store so other tabs/windows pick it up too.
          hydrateFromServer({
            isFlagged: true,
            confidence: data.confidence,
            blockerType: data.blockerType,
            methods: data.methods,
            serverVerified: data.serverVerified,
            detectedAt: data.detectedAt,
          })
          setIsFlagged(true)
          setIsBlocked(true)
          setConfidence(data.confidence ?? 100)
          setServerVerified(data.serverVerified ?? true)
          setBlockerType(data.blockerType ?? null)
          setDetectionMethods(data.methods ?? [])
        } else if (getAdblockSessionState().isFlagged) {
          // Server says we are NOT flagged but local persisted state still
          // thinks we are — admin lifted the flag (or self-heal completed in
          // another tab). Mirror the cleared state locally so the red
          // flagged modal closes here too.
          setIsFlagged(false)
          setIsBlocked(false)
          setConfidence(0)
          setServerVerified(false)
          setBlockerType(null)
          setDetectionMethods([])
          setSignals([])
        }
      } catch {
        // Fail open — detection cycle will re-flag if needed
      }
    }

    hydrate()

    // Re-hydrate periodically as a defense in depth — if the admin lifts the
    // flag (appeal accepted) the server is the source of truth and we'll
    // notice within 60s. If the admin adds a flag, we'll pick that up too.
    const interval = setInterval(hydrate, 60000)

    // Re-hydrate when the tab becomes visible again.
    const onVis = () => {
      if (document.visibilityState === "visible") hydrate()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      cancelled = true
      ac.abort()
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  // v13.0: Recovery sweep — every 2.5s re-pull from session store. If another
  // tab or the detection hook updated the flagged state but this provider
  // missed the BroadcastChannel message (rare race), we'll catch up here.
  // This makes the provider self-healing across all dashboard subroutes.
  useEffect(() => {
    const recoveryTimer = setInterval(() => {
      const state = getAdblockSessionState()
      if (state.isFlagged && !isFlagged) {
        setIsFlagged(true)
        setIsBlocked(state.isBlocked)
        setConfidence(state.confidence)
        setConsecutiveDetections(state.consecutiveDetections)
        setServerVerified(state.serverVerified)
        setBlockerType(state.blockerType)
        setDetectionMethods(state.methods)
        setSignals(state.signals || [])
      } else if (!state.isFlagged && isFlagged) {
        // v17.0 — session was cleared (self-heal or admin) but our local
        // provider state still thinks we're flagged. Mirror the cleared
        // state so the modal closes here too.
        setIsFlagged(false)
        setIsBlocked(false)
        setConfidence(0)
        setConsecutiveDetections(0)
        setServerVerified(false)
        setBlockerType(null)
        setDetectionMethods([])
        setSignals([])
      }
    }, 2500)
    return () => clearInterval(recoveryTimer)
  }, [isFlagged])

  // Subscribe to cross-tab updates.
  // v17.0 — also propagate self-heal: when state.isFlagged flips to false
  // (another tab self-healed or admin cleared), mirror the cleared state
  // locally so the modal closes immediately in every tab.
  useEffect(() => {
    const unsubscribe = subscribeToCrossTabUpdates((state) => {
      if (state.isFlagged) {
        setIsFlagged(true)
        setIsBlocked(state.isBlocked)
        setConfidence(state.confidence)
        setConsecutiveDetections(state.consecutiveDetections)
        setServerVerified(state.serverVerified)
        setBlockerType(state.blockerType)
        setDetectionMethods(state.methods)
        setSignals(state.signals || [])
      } else {
        // Self-heal / admin clear broadcast
        setIsFlagged(false)
        setIsBlocked(false)
        setConfidence(0)
        setConsecutiveDetections(0)
        setServerVerified(false)
        setBlockerType(null)
        setDetectionMethods([])
        setSignals([])
      }
    })

    return unsubscribe
  }, [])

  // Set flagged state
  const setFlagged = useCallback(
    (
      blockerType: string | null,
      confidence: number,
      methods: string[],
      signals: DetectionSignal[],
      serverVerified: boolean,
    ) => {
      setIsFlagged(true)
      setIsBlocked(true)
      setConfidence(confidence)
      setBlockerType(blockerType)
      setDetectionMethods(methods)
      setSignals(signals)
      setServerVerified(serverVerified)

      // Report to server for user flagging
      fetch("/api/fraud/adblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          blockerType,
          confidence,
          methods,
          signals: signals.map((s) => ({
            method: s.method,
            category: s.category,
            weight: s.weight,
            confidence: s.confidence,
          })),
          serverVerified,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    },
    [userId],
  )

  // Check if user is blocked
  const checkBlockStatus = useCallback(() => {
    return isFlagged || isBlocked
  }, [isFlagged, isBlocked])

  // Get current detection state
  const getDetectionState = useCallback(() => {
    return getAdblockSessionState()
  }, [])

  // Request appeal for false positive
  const requestAppeal = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/fraud/adblock/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          currentState: getAdblockSessionState(),
          timestamp: new Date().toISOString(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        return data.appealAccepted === true
      }
    } catch {}

    return false
  }, [userId])

  return (
    <AdblockContext.Provider
      value={{
        isFlagged,
        isBlocked,
        confidence,
        consecutiveDetections,
        serverVerified,
        blockerType,
        detectionMethods,
        signals,
        setFlagged,
        checkBlockStatus,
        getDetectionState,
        requestAppeal,
      }}
    >
      {children}
      <AdblockWarningModal
        userId={userId}
        warningDurationSeconds={warningDurationSeconds}
        onFraudFlagged={setFlagged}
      />
    </AdblockContext.Provider>
  )
}
