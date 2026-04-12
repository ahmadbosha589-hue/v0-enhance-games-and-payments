"use client"

import { useRouter } from "next/navigation"
import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { toast } from "sonner"

interface UseAuthReturn {
  signOut: () => Promise<void>
  updateProfile: (data: Record<string, unknown>) => Promise<void>
}

// Helper to clear all auth-related storage
function clearAuthStorage() {
  if (typeof window === "undefined") return

  try {
    // Clear localStorage
    const localKeys = Object.keys(localStorage).filter(
      key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
    )
    localKeys.forEach(key => localStorage.removeItem(key))

    // Clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage).filter(
      key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
    )
    sessionKeys.forEach(key => sessionStorage.removeItem(key))
  } catch (e) {
    console.warn("[useAuth] Error clearing storage:", e)
  }
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()

  const signOut = async () => {
    // Clear storage first to ensure user is logged out even if API call hangs
    clearAuthStorage()

    try {
      const supabase = createClient()

      if (supabase) {
        // Use a timeout to prevent hanging - if signOut takes too long, proceed anyway
        const signOutPromise = supabase.auth.signOut({ scope: 'local' })
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Sign out timeout")), 3000)
        )

        try {
          await Promise.race([signOutPromise, timeoutPromise])
        } catch (err) {
          // Timeout or error - continue with redirect anyway
          console.warn("[useAuth] Sign out API call issue:", err)
        }
      }

      toast.success("Signed out successfully")
    } catch (err) {
      console.error("[useAuth] Sign out failed:", err)
      toast.success("Signed out") // Still show success since storage was cleared
    } finally {
      // Always redirect - storage is already cleared
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
