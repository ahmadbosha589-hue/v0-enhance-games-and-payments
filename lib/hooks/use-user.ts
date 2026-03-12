"use client"

import { useEffect, useState } from "react"
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

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchUser = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()

      // Handle case where Supabase client couldn't be created
      if (!supabase) {
        setUser(null)
        setProfile(null)
        setIsLoading(false)
        return
      }

      // Primary: getUser() verifies the JWT server-side (most secure)
      // Fallback: getSession() reads from local storage — used when getUser()
      // fails due to transient network/auth errors (e.g. during token refresh)
      let resolvedUser = null
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        // Fallback to session — avoids showing "not logged in" on transient errors
        const { data: { session } } = await supabase.auth.getSession()
        resolvedUser = session?.user ?? null
      } else {
        resolvedUser = user
      }

      setUser(resolvedUser)

      if (resolvedUser) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", resolvedUser.id)
          .single()

        if (profileError && profileError.code !== "PGRST116") {
          throw profileError
        }

        setProfile(profileData)
      } else {
        setProfile(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch user"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()

    const supabase = createClient()

    // If Supabase client is not available, skip auth state listener
    if (!supabase) {
      return
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUser()
      } else {
        setProfile(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { user, profile, isLoading, error, refetch: fetchUser }
}