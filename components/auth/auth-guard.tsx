"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/hooks/use-user"
import { Loader2 } from "lucide-react"

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: "user" | "moderator" | "admin" | "superadmin"
  fallbackUrl?: string
}

export function AuthGuard({ children, requiredRole, fallbackUrl = "/auth/login" }: AuthGuardProps) {
  const { user, profile, isLoading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(fallbackUrl)
    }

    if (!isLoading && user && requiredRole && profile) {
      const roleHierarchy = ["user", "moderator", "admin", "superadmin"]
      const userRoleIndex = roleHierarchy.indexOf(profile.role)
      const requiredRoleIndex = roleHierarchy.indexOf(requiredRole)

      if (userRoleIndex < requiredRoleIndex) {
        router.push("/dashboard")
      }
    }
  }, [user, profile, isLoading, router, requiredRole, fallbackUrl])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
