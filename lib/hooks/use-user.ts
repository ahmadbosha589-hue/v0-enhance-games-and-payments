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
    if (fetchingRef.current) {
      console.log("[v0] fetchUser skipped - already fetching")
      return
    }
    fetchingRef.current = true
    console.log("[v0] fetchUser started")

    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()
      if (!supabase) {
        console.log("[v0] fetchUser - no supabase client")
        setUser(null)
        setProfile(null)
        setIsLoading(false)
        return
      }

      // ROOT CAUSE FIX: Clear any orphaned Web Lock before ANY auth operations.
      // @supabase/ssr uses navigator.locks to serialize auth. When React Strict Mode
      // double-mounts or navigation happens mid-request, the lock can get stuck
      // causing getSession()/getUser() to hang forever.
      // See: https://github.com/supabase/supabase-js/issues/2111
      console.log("[v0] fetchUser - clearing orphaned lock")
      await clearOrphanedAuthLock()
      console.log("[v0] fetchUser - lock cleared")

      // ── STEP 1: getSession() first — reads from localStorage/cookie, no network ──
      // This unblocks the UI immediately with whatever session the browser has.
      console.log("[v0] fetchUser - getting session")
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        2000,
        { data: { session: null }, error: null } as any
      )
      const sessionUser = sessionResult.data?.session?.user ?? null
      console.log("[v0] fetchUser - session result:", sessionUser ? sessionUser.email : "null")

      if (!mountedRef.current) {
        console.log("[v0] fetchUser - unmounted after getSession")
        return
      }

      // Show the user immediately so the circle never hangs
      if (sessionUser) {
        console.log("[v0] fetchUser - setting user from session, isLoading=false")
        setUser(sessionUser)
        setIsLoading(false)
      }

      // ── STEP 2: getUser() in background — verifies JWT server-side ──
      // If it times out or fails, fall back to sessionUser — NEVER log out
      // just because a background verify was slow.
      console.log("[v0] fetchUser - verifying with getUser")
      const getUserResult = await withTimeout(
        supabase.auth.getUser(),
        8000,
        // timeout fallback: treat as if getUser returned the session user
        { data: { user: sessionUser }, error: null } as any
      )
      console.log("[v0] fetchUser - getUser complete")

      if (!mountedRef.current) {
        console.log("[v0] fetchUser - unmounted after getUser")
        return
      }

      const verifiedUser = getUserResult.data?.user ?? sessionUser

      if (verifiedUser?.id !== sessionUser?.id) {
        setUser(verifiedUser)
      }

      // ── STEP 3: Fetch profile ──
      const resolvedUser = verifiedUser ?? sessionUser
      if (resolvedUser) {
        console.log("[v0] fetchUser - fetching profile for", resolvedUser.email)
        const profileResult = await withTimeout(
          supabase.from("profiles").select("*").eq("id", resolvedUser.id).single(),
          6000,
          { data: null, error: new Error("profile timeout") } as any
        )
        console.log("[v0] fetchUser - profile fetched:", profileResult.data?.display_name || "null")
        if (!mountedRef.current) return
        setProfile(
          !profileResult.error || profileResult.error?.code === "PGRST116"
            ? profileResult.data ?? null
            : null
        )
      } else {
        // No session at all — genuinely not logged in
        console.log("[v0] fetchUser - no user, setting null")
        setUser(null)
        setProfile(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Failed to fetch user"))
      }
    } finally {
      console.log("[v0] fetchUser - finally block, setting isLoading=false")
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

      console.log("[v0] onAuthStateChange:", event, "session:", session ? "present" : "null", "user:", session?.user?.email)

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
