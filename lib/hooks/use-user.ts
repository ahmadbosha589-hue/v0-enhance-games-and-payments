"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types/database"

interface UseUserReturn {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

// ────────────────────────────────────────────────────────────────────────────
// Module-level cache shared across all useUser() callers.
// This prevents N components from each firing their own /api/auth/me request
// and own supabase.auth.getUser() round-trip on mount. The cache is hydrated
// once per page, and reused by every subsequent caller for the same tab.
// ────────────────────────────────────────────────────────────────────────────
type Snapshot = {
  user: User | null
  profile: Profile | null
  fetchedAt: number
}
let snapshot: Snapshot | null = null
let inFlight: Promise<Snapshot> | null = null
const SNAPSHOT_TTL_MS = 30_000 // 30s — auth state rarely changes that fast

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

async function loadSnapshot(force = false): Promise<Snapshot> {
  // Return fresh cache if available
  if (!force && snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) {
    return snapshot
  }
  // Share in-flight request
  if (inFlight && !force) return inFlight

  inFlight = (async (): Promise<Snapshot> => {
    let resolvedUser: User | null = null
    let resolvedProfile: Profile | null = null

    // ── PRIMARY: server-side /api/auth/me (httpOnly cookie, no Web Locks) ──
    try {
      const res = await withTimeout(
        fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
        4000,
        null as any,
      )
      if (res && res.ok) {
        const data = await res.json()
        if (data?.user) {
          resolvedUser = data.user
          resolvedProfile = data.profile ?? null
        }
      }
    } catch {
      // ignore — fall through to client
    }

    // ── FALLBACK: client supabase (only if server didn't return a user) ──
    if (!resolvedUser) {
      const supabase = createClient()
      if (supabase) {
        try {
          const { data } = await withTimeout(
            supabase.auth.getUser(),
            4000,
            { data: { user: null }, error: null } as any,
          )
          resolvedUser = data?.user ?? null
        } catch {
          // ignore
        }
      }
    }

    // ── PROFILE: fetch if we have a user but no profile yet ──
    if (resolvedUser && !resolvedProfile) {
      const supabase = createClient()
      if (supabase) {
        try {
          const result = await withTimeout(
            supabase.from("profiles").select("*").eq("id", resolvedUser.id).single(),
            4000,
            { data: null, error: null } as any,
          )
          resolvedProfile = result?.data ?? null
        } catch {
          // ignore
        }
      }
    }

    snapshot = { user: resolvedUser, profile: resolvedProfile, fetchedAt: Date.now() }
    return snapshot
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

export function useUser(): UseUserReturn {
  // Initialize from cache to avoid a flash of loading state when navigating
  // between pages that all use useUser().
  const initial = snapshot
  const [user, setUser] = useState<User | null>(initial?.user ?? null)
  const [profile, setProfile] = useState<Profile | null>(initial?.profile ?? null)
  const [isLoading, setIsLoading] = useState(!initial)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  const refetch = useCallback(async () => {
    try {
      setError(null)
      const snap = await loadSnapshot(true)
      if (!mountedRef.current) return
      setUser(snap.user)
      setProfile(snap.profile)
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Failed to fetch user"))
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Hydrate state from cache or fetch.
    if (snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) {
      setUser(snapshot.user)
      setProfile(snapshot.profile)
      setIsLoading(false)
    } else {
      loadSnapshot()
        .then((snap) => {
          if (!mountedRef.current) return
          setUser(snap.user)
          setProfile(snap.profile)
          setIsLoading(false)
        })
        .catch((err) => {
          if (!mountedRef.current) return
          setError(err instanceof Error ? err : new Error("Failed to fetch user"))
          setIsLoading(false)
        })
    }

    // Subscribe to auth state changes. We DON'T refetch on every event — we
    // only react to definitive transitions to avoid render storms during
    // token refresh.
    const supabase = createClient()
    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!mountedRef.current) return

      if (event === "INITIAL_SESSION") return

      if (event === "SIGNED_OUT") {
        // Genuine sign-out — clear cache and state immediately.
        snapshot = { user: null, profile: null, fetchedAt: Date.now() }
        setUser(null)
        setProfile(null)
        setIsLoading(false)
        return
      }

      if (event === "SIGNED_IN" && session?.user) {
        // Update user immediately from the session; lazy-refresh profile.
        setUser(session.user)
        setIsLoading(false)
        // Invalidate cache so a refetch pulls fresh profile data.
        snapshot = null
        loadSnapshot().then((snap) => {
          if (!mountedRef.current) return
          setUser(snap.user)
          setProfile(snap.profile)
        })
        return
      }

      if (event === "USER_UPDATED" && session?.user) {
        setUser(session.user)
        snapshot = null
        loadSnapshot().then((snap) => {
          if (!mountedRef.current) return
          setProfile(snap.profile)
        })
        return
      }

      // TOKEN_REFRESHED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED — these
      // do NOT change identity, so we ignore them to prevent re-render storms
      // and false "Welcome back" toasts elsewhere.
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, profile, isLoading, error, refetch }
}
