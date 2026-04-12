"use client"

import { useRouter } from "next/navigation"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { toast } from "sonner"

interface UseAuthReturn {
  signOut: () => Promise<void>
  updateProfile: (data: Record<string, unknown>) => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()

  const signOut = async () => {
    try {
      const supabase = createClient()

      // Clear orphaned Web Lock before auth operation
      await clearOrphanedAuthLock()

      if (supabase) {
        const { error } = await supabase.auth.signOut()
        if (error) {
          console.error("[useAuth] Sign out error:", error)
        }
      }

      // Clear all local storage auth data
      if (typeof window !== "undefined") {
        // Clear Supabase auth tokens from localStorage
        const keysToRemove = Object.keys(localStorage).filter(
          key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
        )
        keysToRemove.forEach(key => localStorage.removeItem(key))

        // Clear session storage too
        const sessionKeysToRemove = Object.keys(sessionStorage).filter(
          key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
        )
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key))
      }

      toast.success("Signed out successfully")

      // Force a hard navigation to clear all state
      window.location.href = "/"
    } catch (err) {
      console.error("[useAuth] Sign out failed:", err)
      // Even if signOut fails, clear local data and redirect
      if (typeof window !== "undefined") {
        const keysToRemove = Object.keys(localStorage).filter(
          key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
        )
        keysToRemove.forEach(key => localStorage.removeItem(key))
      }
      toast.error("Sign out encountered an issue, but you've been logged out locally")
      window.location.href = "/"
    }
  }

  const updateProfile = async (data: Record<string, unknown>) => {
    try {
      const supabase = createClient()
      if (!supabase) {
        throw new Error("Service unavailable")
      }

      // Clear orphaned Web Lock before auth operation
      await clearOrphanedAuthLock()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase.from("profiles").update(data).eq("id", user.id)

      if (error) throw error

      toast.success("Profile updated successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile")
      throw err
    }
  }

  return { signOut, updateProfile }
}
