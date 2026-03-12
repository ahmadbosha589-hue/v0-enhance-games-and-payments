"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
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

      // ── STEP 1: getSession() FIRST — reads localStorage, instant, no network ──
      // This unblocks the UI immediately so the skeleton never hangs.
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        2000,
        { data: { session: null }, error: null } as any
      )
      const sessionUser = sessionResult.data?.session?.user ?? null

      if (!mountedRef.current) return

      // Show whatever we have right away — user sees avatar immediately
      if (sessionUser) {
        setUser(sessionUser)
        setIsLoading(false) // ← unblock UI as soon as session resolves
      }

      // ── STEP 2: getUser() in the background — verifies JWT server-side ──
      // If it fails or times out, we KEEP the session user (don't log them out).
      // Only clear user if getUser() explicitly says "not authenticated" (no error,
      // just no user) AND there was also no session.
      const getUserResult = await withTimeout(
        supabase.auth.getUser(),
        8000,
        { data: { user: sessionUser }, error: null } as any // fallback = keep session user
      )

      if (!mountedRef.current) return

      const verifiedUser = getUserResult.data?.user ?? sessionUser

      // Only update user state if verification returned something different
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

        if (!profileResult.error || profileResult.error.code === "PGRST116") {
          setProfile(profileResult.data ?? null)
        } else {
          // Profile fetch failed — non-fatal, keep loading false
          console.warn("[useUser] Profile fetch failed:", profileResult.error?.message)
          setProfile(null)
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
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchUser()

    const supabase = createClient()
    if (!supabase) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return
      // Skip the immediate fire on subscribe — fetchUser() above handles initial load
      if (event === "INITIAL_SESSION") return

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