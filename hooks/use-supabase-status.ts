"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export interface SupabaseStatus {
  connected: boolean
  status: "connected" | "degraded" | "disconnected" | "unconfigured" | "checking"
  latency: number | null
  message: string
  timestamp: string
  checks: {
    envVars: boolean
    clientCreation: boolean
    dbQuery: boolean
  }
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
}

// Global cache so all components see the same status without duplicate fetches
let cachedStatus: SupabaseStatus = DEFAULT_STATUS
let lastFetchTime = 0
const CACHE_DURATION = 30_000 // 30 seconds
const listeners = new Set<(status: SupabaseStatus) => void>()

function notifyListeners(status: SupabaseStatus) {
  cachedStatus = status
  listeners.forEach((fn) => fn(status))
}

let fetchInProgress = false

async function fetchStatus(force = false) {
  const now = Date.now()
  if (!force && now - lastFetchTime < CACHE_DURATION && cachedStatus.status !== "checking") {
    return cachedStatus
  }

  if (fetchInProgress) return cachedStatus
  fetchInProgress = true

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const res = await fetch("/api/admin/supabase-status", {
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data: SupabaseStatus = await res.json()
      lastFetchTime = Date.now()
      notifyListeners(data)
      return data
    } else {
      const errorStatus: SupabaseStatus = {
        connected: false,
        status: "disconnected",
        latency: null,
        message: "Failed to check Supabase status.",
        timestamp: new Date().toISOString(),
        checks: { envVars: false, clientCreation: false, dbQuery: false },
      }
      lastFetchTime = Date.now()
      notifyListeners(errorStatus)
      return errorStatus
    }
  } catch {
    const errorStatus: SupabaseStatus = {
      connected: false,
      status: "disconnected",
      latency: null,
      message: "Network error checking Supabase status.",
      timestamp: new Date().toISOString(),
      checks: { envVars: false, clientCreation: false, dbQuery: false },
    }
    lastFetchTime = Date.now()
    notifyListeners(errorStatus)
    return errorStatus
  } finally {
    fetchInProgress = false
  }
}

export function useSupabaseStatus(pollInterval = 60_000) {
  const [status, setStatus] = useState<SupabaseStatus>(cachedStatus)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Register listener
    listeners.add(setStatus)

    // Initial fetch
    fetchStatus()

    // Poll periodically
    intervalRef.current = setInterval(() => {
      fetchStatus(true)
    }, pollInterval)

    return () => {
      listeners.delete(setStatus)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [pollInterval])

  const refresh = useCallback(() => {
    return fetchStatus(true)
  }, [])

  return { ...status, refresh }
}
