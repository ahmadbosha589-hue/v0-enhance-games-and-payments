"use client"

import { createClient, clearOrphanedAuthLock } from "@/lib/supabase/client"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { toast } from "sonner"

interface UseAuthReturn {
  signOut: () => Promise<void>
  updateProfile: (data: Record<string, unknown>) => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const signOut = async () => {
    try {
      await signOutEverywhere()
      toast.success("Signed out successfully")
    } catch (err) {
      console.error("[useAuth] Sign out failed:", err)
      toast.success("Signed out")
    }
  }

  const updateProfile = async (data: Record<string, unknown>) => {
    try {
      const supabase = createClient()

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
