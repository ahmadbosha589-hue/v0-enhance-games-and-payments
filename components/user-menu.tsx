"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n/language-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, Settings, LogOut, Wallet, Users, History, Shield, HelpCircle, Loader2, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { maskEmail } from "@/lib/utils/mask-email"

interface UserMenuProps {
  user: {
    id: string
    email?: string
    display_name?: string | null
    avatar_url?: string | null
    role?: string
  }
}

export function UserMenu({ user }: UserMenuProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const { t } = useLanguage()

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isLoading) return

    setIsLoading(true)

    // Clear all local storage auth data first
    if (typeof window !== "undefined") {
      try {
        const localKeys = Object.keys(localStorage).filter(
          key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
        )
        localKeys.forEach(key => localStorage.removeItem(key))

        const sessionKeys = Object.keys(sessionStorage).filter(
          key => key.includes("supabase") || key.includes("sb-") || key.includes("auth")
        )
        sessionKeys.forEach(key => sessionStorage.removeItem(key))
      } catch (e) {
        console.warn("[UserMenu] Error clearing storage:", e)
      }
    }

    try {
      const supabase = createClient()
      if (supabase) {
        // Use global scope to clear server-side session as well
        const signOutPromise = supabase.auth.signOut({ scope: 'global' })
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        )

        try {
          await Promise.race([signOutPromise, timeoutPromise])
        } catch {
          // Timeout or error - continue anyway
        }
      }

      toast.success("Signed out successfully")
    } catch (error) {
      console.error("[UserMenu] Sign out failed:", error)
      toast.success("Signed out")
    } finally {
      // Clear cookies and redirect with cache-busting query to force fresh state
      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim()
        if (name.includes("supabase") || name.includes("sb-")) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        }
      })
      // Add timestamp to force fresh load and bypass any caching
      window.location.href = `/?signedOut=${Date.now()}`
    }
  }

  const copyUserId = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(user.id)
      setCopied(true)
      toast.success("User ID copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }

  const initials =
    user.display_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() ||
    user.email?.charAt(0).toUpperCase() ||
    "U"

  const isAdmin = user.role === "admin" || user.role === "superadmin" || user.role === "moderator"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="User menu">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar_url || undefined} alt={user.display_name || "User avatar"} />
            <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.display_name || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{maskEmail(user.email, true)}</p>
            <div className="flex items-center gap-1 pt-1">
              <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1 py-0.5 rounded">
                ID: {user.id.slice(0, 8)}...
              </code>
              <button
                onClick={copyUserId}
                className="p-0.5 hover:bg-muted rounded transition-colors"
                aria-label="Copy full User ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                )}
              </button>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="cursor-pointer">
              <User className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.dashboard")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/withdrawals" className="cursor-pointer">
              <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.withdrawals")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/referrals" className="cursor-pointer">
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.referrals")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/history" className="cursor-pointer">
              <History className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.history")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/help" className="cursor-pointer">
              <HelpCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("userMenu.helpCenter")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("userMenu.adminPanel")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={isLoading} className="cursor-pointer text-destructive">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isLoading ? t("userMenu.signingOut") : t("userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
