"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types/database"

interface UseUserReturn {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  const fetchingRef = useRef(false)

  const fetchUser = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true

    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()
      if (!supabase) {
        setUser(null)
        setProfile(null)
        return
      }

      // ROOT CAUSE FIX: Clear any orphaned Web Lock before ANY auth operations.
      // @supabase/ssr uses navigator.locks to serialize auth. When React Strict Mode
      // double-mounts or navigation happens mid-request, the lock can get stuck
      // causing getSession()/getUser() to hang forever.
      // See: https://github.com/supabase/supabase-js/issues/2111
      await clearOrphanedAuthLock()

      // ── STEP 1: getSession() first — reads from localStorage/cookie, no network ──
      // This unblocks the UI immediately with whatever session the browser has.
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        2000,
        { data: { session: null }, error: null } as any
      )
      const sessionUser = sessionResult.data?.session?.user ?? null

      if (!mountedRef.current) return

      // Show the user immediately so the circle never hangs
      if (sessionUser) {
        setUser(sessionUser)
        setIsLoading(false)
      }

      // ── STEP 2: getUser() in background — verifies JWT server-side ──
      // If it times out or fails, fall back to sessionUser — NEVER log out
      // just because a background verify was slow.
      const getUserResult = await withTimeout(
        supabase.auth.getUser(),
        8000,
        // timeout fallback: treat as if getUser returned the session user
        { data: { user: sessionUser }, error: null } as any
      )

      if (!mountedRef.current) return

      const verifiedUser = getUserResult.data?.user ?? sessionUser

      if (verifiedUser?.id !== sessionUser?.id) {
        setUser(verifiedUser)
      }

      // ── STEP 3: Fetch profile ──
      const resolvedUser = verifiedUser ?? sessionUser
      if (resolvedUser) {
        const profileResult = await withTimeout(
          supabase.from("profiles").select("*").eq("id", resolvedUser.id).single(),
          6000,
          { data: null, error: new Error("profile timeout") } as any
        )
        if (!mountedRef.current) return
        setProfile(
          !profileResult.error || profileResult.error?.code === "PGRST116"
            ? profileResult.data ?? null
            : null
        )
      } else {
        // No session at all — genuinely not logged in
        setUser(null)
        setProfile(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Failed to fetch user"))
      }
    } finally {
      fetchingRef.current = false
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchUser()

    const supabase = createClient()
    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return

      // Skip the immediate fire on subscribe — fetchUser() above handles initial load
      if (event === "INITIAL_SESSION") return

      // ── SIGNED_OUT: verify before acting ──
      // Supabase can fire spurious SIGNED_OUT events when auth is slow to init
      // or when the Function/eval override in console-protection broke something.
      // Double-check with getSession() before clearing the user.
      if (event === "SIGNED_OUT") {
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
          if (!mountedRef.current) return
          if (!currentSession) {
            // Confirmed: genuinely signed out
            setUser(null)
            setProfile(null)
            setIsLoading(false)
          }
          // If getSession() still has a session, the SIGNED_OUT was a false alarm — ignore it
        }).catch(() => {
          // If getSession itself errors, trust the event
          if (mountedRef.current) {
            setUser(null)
            setProfile(null)
            setIsLoading(false)
          }
        })
        return
      }

      // For all other events (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, etc.)
      // update the user from the event's session
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUser()
      } else {
        setProfile(null)
        setIsLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [fetchUser])

  return { user, profile, isLoading, error, refetch: fetchUser }
}
