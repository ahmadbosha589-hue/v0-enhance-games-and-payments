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
      if (!supabase) {
        toast.error("Service unavailable")
        return
      }

      // Clear orphaned Web Lock before auth operation
      await clearOrphanedAuthLock()

      const { error } = await supabase.auth.signOut()

      if (error) throw error

      toast.success("Signed out successfully")
      router.push("/")
      router.refresh()
    } catch {
      toast.error("Failed to sign out")
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
