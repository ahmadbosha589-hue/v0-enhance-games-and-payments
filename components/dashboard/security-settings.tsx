"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Eye, EyeOff, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TwoFactorSetup } from "./two-factor-setup"
import type { Profile } from "@/lib/types/database"

interface SecuritySettingsProps {
  profile: Profile
}

export function SecuritySettings({ profile }: SecuritySettingsProps) {
  const [loading, setLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const supabase = createClient()

  const [twoFactorStatus, setTwoFactorStatus] = useState({
    enabled: profile.two_factor_enabled || false,
    enabledAt: null as string | null,
    backupCodesRemaining: 0,
  })

  const fetchTwoFactorStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/2fa/status")
      if (res.ok) {
        const data = await res.json()
        setTwoFactorStatus({
          enabled: data.enabled,
          enabledAt: data.enabledAt,
          backupCodesRemaining: data.backupCodesRemaining,
        })
      }
    } catch (error) {
      console.error("Failed to fetch 2FA status:", error)
    }
  }, [])

  useEffect(() => {
    fetchTwoFactorStatus()
  }, [fetchTwoFactorStatus])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      toast.success("Password updated successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      toast.error("Failed to update password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <TwoFactorSetup
        isEnabled={twoFactorStatus.enabled}
        enabledAt={twoFactorStatus.enabledAt}
        backupCodesRemaining={twoFactorStatus.backupCodesRemaining}
        onStatusChange={fetchTwoFactorStatus}
      />

      <Separator />

      {/* Change Password */}
      <form onSubmit={handlePasswordChange} className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base">Change Password</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="current-password">Current Password</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
            >
              {showCurrentPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">New Password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowNewPassword(!showNewPassword)}
            >
              {showNewPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm New Password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </div>

        <Button type="submit" disabled={loading || !newPassword || !confirmPassword}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Password
        </Button>
      </form>

      <Separator />

      {/* Active Sessions */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base">Active Sessions</Label>
        </div>
        <div className="rounded-lg border p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Current Session</p>
              <p className="text-xs text-muted-foreground">This device • Last active now</p>
            </div>
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
              Active
            </Badge>
          </div>
        </div>
        <Button variant="destructive" size="sm" disabled>
          Sign Out All Other Sessions
        </Button>
      </div>
    </div>
  )
}
