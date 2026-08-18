"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types/database"
import type { AuthChangeEvent, RealtimeChannel, Session } from "@supabase/supabase-js"

interface UseRealtimeProfileReturn {
  profile: Profile | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useRealtimeProfile(userId: string | undefined): UseRealtimeProfileReturn {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Track auth session to detect re-authentication
  const sessionIdRef = useRef<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const supabase = createClient()

      // Handle case where Supabase client couldn't be created
      if (!supabase) {
        setProfile(null)
        setIsLoading(false)
        return
      }

      // Always fetch fresh from database - never cache
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (fetchError) throw fetchError
      setProfile(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch profile"))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchProfile()

    if (!userId) return

    const supabase = createClient()

    // Handle case where Supabase client couldn't be created
    if (!supabase) return

    let channel: RealtimeChannel

    // Subscribe to realtime changes for profile updates
    channel = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload: { eventType: string; new: unknown }) => {
          if (payload.eventType === "UPDATE") {
            setProfile(payload.new as Profile)
          }
        },
      )
      .subscribe()

    // Listen for auth state changes to refetch on re-authentication
    // This ensures we get fresh data when user logs back in
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_IN" && session?.user?.id === userId) {
          // ALWAYS refetch on SIGNED_IN to get the authoritative balance from database
          // This prevents stale/cached data from showing incorrect balance
          await fetchProfile()
          sessionIdRef.current = session.access_token?.substring(0, 20) || null
        } else if (event === "SIGNED_OUT") {
          sessionIdRef.current = null
          setProfile(null)
        } else if (event === "TOKEN_REFRESHED" && session?.user?.id === userId) {
          // Also refetch on token refresh to ensure data is current
          await fetchProfile()
        }
      }
    )

    // Initialize session ID (don't fetch here, fetchProfile() is already called above)
    // Clear orphaned Web Lock before any auth operation to prevent hangs
    clearOrphanedAuthLock().then(() => {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        sessionIdRef.current = session?.access_token?.substring(0, 20) || null
      })
    })

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      authSubscription.unsubscribe()
    }
  }, [userId, fetchProfile])

  return { profile, isLoading, error, refetch: fetchProfile }
}
