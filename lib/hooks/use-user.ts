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
        setIsLoading(false)
        return
      }

      // Clear any orphaned Web Lock before auth operations
      await clearOrphanedAuthLock()

      // ── STEP 1: Try to get user from client-side auth ──
      // Use getUser() which makes a server call - more reliable than getSession()
      const getUserResult = await withTimeout(
        supabase.auth.getUser(),
        5000,
        { data: { user: null }, error: null } as any
      )

      let resolvedUser = getUserResult.data?.user ?? null

      let serverProfile: Profile | null = null

      // ── STEP 2: If no user from client, try the server API ──
      // This handles the case where cookies have the session but client doesn't
      if (!resolvedUser) {
        try {
          const response = await fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store"
          })
          if (response.ok) {
            const data = await response.json()
            if (data.user) {
              resolvedUser = data.user
              serverProfile = data.profile ?? null
            }
          }
        } catch {
          // API call failed, continue with null user
        }
      }

      if (!mountedRef.current) return

      // Update user state
      if (resolvedUser) {
        setUser(resolvedUser)
        setIsLoading(false)

        // Use profile from server if available, otherwise fetch it
        if (serverProfile) {
          setProfile(serverProfile)
        } else {
          // ── STEP 3: Fetch profile ──
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
        }
      } else {
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
        // Add a small delay to let any in-flight auth operations complete
        setTimeout(() => {
          if (!mountedRef.current) return

          supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            if (!mountedRef.current) return
            if (!currentSession) {
              // Double-check with getUser as well to be absolutely sure
              supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
                if (!mountedRef.current) return
                if (!currentUser) {
                  // Confirmed: genuinely signed out
                  setUser(null)
                  setProfile(null)
                  setIsLoading(false)
                }
                // If getUser() still has a user, the SIGNED_OUT was a false alarm
              }).catch(() => {
                // If getUser errors but getSession shows no session, likely signed out
                if (mountedRef.current) {
                  setUser(null)
                  setProfile(null)
                  setIsLoading(false)
                }
              })
            }
            // If getSession() still has a session, the SIGNED_OUT was a false alarm — ignore it
          }).catch(() => {
            // If getSession itself errors, DON'T immediately log out
            // This could be a network hiccup - keep the current state
            console.warn("[useUser] getSession failed during SIGNED_OUT verification - keeping current state")
          })
        }, 500) // 500ms delay to let things settle
        return
      }

      // For all other events (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, etc.)
      // Only update if we have a valid session - don't clear user on null session
      // as this could be a temporary state during token refresh
      if (session?.user) {
        setUser(session.user)
        fetchUser()
      }
      // If session is null for non-SIGNED_OUT events, don't immediately clear
      // the user - this prevents logout during token refresh hiccups.
      // The SIGNED_OUT handler above will properly verify and clear when needed.
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [fetchUser])

  return { user, profile, isLoading, error, refetch: fetchUser }
}
