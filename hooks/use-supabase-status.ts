"use client"

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react"

export type SupabaseHealthStatus = "checking" | "connected" | "degraded" | "disconnected" | "unconfigured"

export interface SupabaseStatus {
  connected: boolean
  status: SupabaseHealthStatus
  latency: number | null
  message: string
  timestamp: string
  checks: {
    envVars: boolean
    clientCreation: boolean
    dbQuery: boolean
  }
  consecutiveFailures: number
  lastCheckedAt: number
  isRefreshing: boolean
}

interface SupabaseStatusContextValue extends SupabaseStatus {
  refresh: () => Promise<void>
}

const DEFAULT_STATUS: SupabaseStatus = {
  connected: false,
  status: "checking",
  latency: null,
  message: "Checking Supabase connectivity...",
  timestamp: new Date().toISOString(),
  checks: {
    envVars: false,
    clientCreation: false,
    dbQuery: false,
  },
  consecutiveFailures: 0,
  lastCheckedAt: 0,
  isRefreshing: false,
}

// ── Global singleton cache ─────────────────────────────────────────────────
// All components share the same status without duplicate fetches, even
// outside the React context provider.
let cachedStatus: SupabaseStatus = DEFAULT_STATUS
let lastFetchTime = 0
const CACHE_DURATION = 30_000 // 30s
const POLL_CONNECTED = 60_000 // 60s polling when healthy
const POLL_DISCONNECTED = 15_000 // 15s polling when disconnected
const FETCH_TIMEOUT = 8_000
const listeners = new Set<(status: SupabaseStatus) => void>()

function notifyListeners(status: SupabaseStatus) {
  cachedStatus = status
  listeners.forEach((fn) => fn(status))
}

let fetchInProgress = false

async function fetchStatus(force = false): Promise<SupabaseStatus> {
  const now = Date.now()
  if (!force && now - lastFetchTime < CACHE_DURATION && cachedStatus.status !== "checking") {
    return cachedStatus
  }

  if (fetchInProgress) return cachedStatus
  fetchInProgress = true

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const res = await fetch("/api/admin/supabase-status", {
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      const newStatus: SupabaseStatus = {
        connected: data.connected,
        status: data.status,
        latency: data.latency,
        message: data.message,
        timestamp: data.timestamp,
        checks: data.checks,
        consecutiveFailures: data.connected ? 0 : cachedStatus.consecutiveFailures + 1,
        lastCheckedAt: Date.now(),
        isRefreshing: false,
      }
      lastFetchTime = Date.now()
      notifyListeners(newStatus)
      return newStatus
    } else {
      const errorStatus: SupabaseStatus = {
        ...cachedStatus,
        connected: false,
        status: "disconnected",
        message: `Health check returned ${res.status}`,
        timestamp: new Date().toISOString(),
        consecutiveFailures: cachedStatus.consecutiveFailures + 1,
        lastCheckedAt: Date.now(),
        isRefreshing: false,
      }
      lastFetchTime = Date.now()
      notifyListeners(errorStatus)
      return errorStatus
    }
  } catch {
    const errorStatus: SupabaseStatus = {
      ...cachedStatus,
      connected: false,
      status: "disconnected",
      message: "Network error checking Supabase status.",
      timestamp: new Date().toISOString(),
      consecutiveFailures: cachedStatus.consecutiveFailures + 1,
      lastCheckedAt: Date.now(),
      isRefreshing: false,
    }
    lastFetchTime = Date.now()
    notifyListeners(errorStatus)
    return errorStatus
  } finally {
    fetchInProgress = false
  }
}

// ── React Context (optional – used when SupabaseHealthProvider wraps tree) ──
const SupabaseStatusContext = createContext<SupabaseStatusContextValue | null>(null)

export const SupabaseStatusProvider = SupabaseStatusContext.Provider

/**
 * Primary hook for Supabase connectivity status.
 *
 * Works both inside and outside the SupabaseHealthProvider:
 * - Inside the provider: reads from context (single source of truth)
 * - Outside: falls back to the global singleton cache with its own polling
 */
export function useSupabaseStatus(pollInterval?: number) {
  // Try context first
  const ctx = useContext(SupabaseStatusContext)
  if (ctx) return ctx

  // Fallback: standalone polling via global cache
  return useSupabaseStatusStandalone(pollInterval)
}

function useSupabaseStatusStandalone(pollInterval?: number) {
  const [status, setStatus] = useState<SupabaseStatus>(cachedStatus)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const effectivePoll = pollInterval ?? (status.connected ? POLL_CONNECTED : POLL_DISCONNECTED)

  useEffect(() => {
    listeners.add(setStatus)
    fetchStatus()

    return () => {
      listeners.delete(setStatus)
    }
  }, [])

  // Adaptive polling: faster when disconnected
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchStatus(true), effectivePoll)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [effectivePoll])

  const refresh = useCallback(async () => {
    notifyListeners({ ...cachedStatus, isRefreshing: true })
    await fetchStatus(true)
  }, [])

  return { ...status, refresh }
}
