"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useSupabaseStatus, type SupabaseHealthStatus, type SupabaseStatus } from "@/hooks/use-supabase-status"

export type { SupabaseHealthStatus }

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

const DEFAULT_STATE: SupabaseHealthContextValue = {
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
  refresh: async () => { },
  isRefreshing: false,
}

const SupabaseHealthContext = createContext<SupabaseHealthContextValue>(DEFAULT_STATE)

interface SupabaseHealthProviderProps {
  children: ReactNode
}

/**
 * Delegates all health-check logic to the global singleton in
 * `use-supabase-status` hook, then exposes it via React context so
 * both `useSupabaseHealth()` and `useSupabaseStatus()` share a
 * single polling loop with no duplication.
 */
export function SupabaseHealthProvider({ children }: SupabaseHealthProviderProps) {
  const status = useSupabaseStatus()

  const value: SupabaseHealthContextValue = {
    status: status.status,
    connected: status.connected,
    latency: status.latency,
    message: status.message,
    timestamp: status.timestamp,
    checks: status.checks,
    lastCheckedAt: status.lastCheckedAt,
    consecutiveFailures: status.consecutiveFailures,
    refresh: status.refresh,
    isRefreshing: status.isRefreshing,
  }

  return (
    <SupabaseHealthContext.Provider value={value}>
      {children}
    </SupabaseHealthContext.Provider>
  )
}

export function useSupabaseHealth() {
  return useContext(SupabaseHealthContext)
}
