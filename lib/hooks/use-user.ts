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

// Race a promise against a hard timeout — NEVER hangs
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
  // Prevent the onAuthStateChange immediate-fire from re-triggering a full fetch
  // while the initial fetchUser is still in flight
  const fetchingRef = useRef(false)
  const mountedRef = useRef(true)

  const fetchUser = useCallback(async () => {
    // De-duplicate: don't stack concurrent fetches
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

      // --- AUTH: getUser() with 5 s hard timeout, then getSession() fallback ---
      let resolvedUser: User | null = null

      const getUserResult = await withTimeout(
        supabase.auth.getUser(),
        5000,
        { data: { user: null }, error: new Error("getUser timeout") } as any
      )

      if (!getUserResult.error && getUserResult.data.user) {
        resolvedUser = getUserResult.data.user
      } else {
        // Fallback: read from local storage (no network call, instant)
        const getSessionResult = await withTimeout(
          supabase.auth.getSession(),
          3000,
          { data: { session: null }, error: null } as any
        )
        resolvedUser = getSessionResult.data?.session?.user ?? null
      }

      if (!mountedRef.current) return
      setUser(resolvedUser)

      // --- PROFILE: only fetch if we have a user ---
      if (resolvedUser) {
        const profileResult = await withTimeout(
          supabase.from("profiles").select("*").eq("id", resolvedUser.id).single(),
          5000,
          { data: null, error: new Error("profile timeout") } as any
        )

        if (!mountedRef.current) return

        if (profileResult.error && profileResult.error.code !== "PGRST116") {
          // Non-fatal: show avatar without profile data rather than hang
          console.warn("[useUser] Profile fetch failed:", profileResult.error.message)
          setProfile(null)
        } else {
          setProfile(profileResult.data ?? null)
        }
      } else {
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

      // onAuthStateChange fires immediately on subscribe — skip that first fire
      // (fetchUser above already handles initial load)
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