"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { AdblockWarningModal } from "./adblock-warning-modal"
import {
  getAdblockSessionState,
  subscribeToCrossTabUpdates,
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

  // Subscribe to cross-tab updates
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
