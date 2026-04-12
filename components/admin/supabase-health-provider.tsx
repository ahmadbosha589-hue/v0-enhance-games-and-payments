"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"

export type SupabaseHealthStatus = "checking" | "connected" | "degraded" | "disconnected" | "unconfigured"

export interface SupabaseHealthState {
  status: SupabaseHealthStatus
  connected: boolean
  latency: number | null
  message: string
  timestamp: string
  checks: {
    envVars: boolean
    clientCreation: boolean
    dbQuery: boolean
  }
  lastCheckedAt: number
  consecutiveFailures: number
}

interface SupabaseHealthContextValue extends SupabaseHealthState {
  refresh: () => Promise<void>
  isRefreshing: boolean
}

const DEFAULT_STATE: SupabaseHealthState = {
  status: "checking",
  connected: false,
  latency: null,
  message: "Checking Supabase connectivity...",
  timestamp: new Date().toISOString(),
  checks: {
    envVars: false,
    clientCreation: false,
    dbQuery: false,
  },
  lastCheckedAt: 0,
  consecutiveFailures: 0,
}

const SupabaseHealthContext = createContext<SupabaseHealthContextValue>({
  ...DEFAULT_STATE,
  refresh: async () => { },
  isRefreshing: false,
})

const POLL_INTERVAL = 60_000 // 60s normal polling
const FAST_POLL_INTERVAL = 15_000 // 15s when disconnected
const FETCH_TIMEOUT = 8_000

interface SupabaseHealthProviderProps {
  children: ReactNode
}

export function SupabaseHealthProvider({ children }: SupabaseHealthProviderProps) {
  const [state, setState] = useState<SupabaseHealthState>(DEFAULT_STATE)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const fetchHealth = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      const res = await fetch("/api/admin/supabase-status", {
        cache: "no-store",
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!mountedRef.current) return

      if (res.ok) {
        const data = await res.json()
        setState((prev) => ({
          status: data.status,
          connected: data.connected,
          latency: data.latency,
          message: data.message,
          timestamp: data.timestamp,
          checks: data.checks,
          lastCheckedAt: Date.now(),
          consecutiveFailures: data.connected ? 0 : prev.consecutiveFailures + 1,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          status: "disconnected",
          connected: false,
          message: `Health check returned ${res.status}`,
          timestamp: new Date().toISOString(),
          lastCheckedAt: Date.now(),
          consecutiveFailures: prev.consecutiveFailures + 1,
        }))
      }
    } catch {
      if (!mountedRef.current) return
      setState((prev) => ({
        ...prev,
        status: "disconnected",
        connected: false,
        message: "Network error checking Supabase status.",
        timestamp: new Date().toISOString(),
        lastCheckedAt: Date.now(),
        consecutiveFailures: prev.consecutiveFailures + 1,
      }))
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    await fetchHealth()
    setIsRefreshing(false)
  }, [fetchHealth])

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true
    fetchHealth()
    return () => {
      mountedRef.current = false
    }
  }, [fetchHealth])

  // Adaptive polling: faster when disconnected, slower when connected
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    const interval = state.connected ? POLL_INTERVAL : FAST_POLL_INTERVAL
    intervalRef.current = setInterval(fetchHealth, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [state.connected, fetchHealth])

  return (
    <SupabaseHealthContext.Provider value={{ ...state, refresh, isRefreshing }}>
      {children}
    </SupabaseHealthContext.Provider>
  )
}

export function useSupabaseHealth() {
  return useContext(SupabaseHealthContext)
}
