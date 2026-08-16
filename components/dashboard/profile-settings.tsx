"use client"

import type React from "react"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import type { Profile } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Copy, Check, AlertCircle, CheckCircle2, Camera, Upload, X } from "lucide-react"
import { toast } from "sonner"

interface ProfileSettingsProps {
  profile: Profile
  email: string
}

export function ProfileSettings({ profile, email }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || "")
  const [username, setUsername] = useState(profile.username || "")
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "")
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const initials =
    displayName
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    email?.slice(0, 2).toUpperCase() ||
    "U"

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2MB")
      return
    }

    setIsUploadingAvatar(true)

    try {
      const supabase = createClient()
      if (!supabase) {
        throw new Error("Service unavailable")
      }

      // Create unique filename
      const fileExt = file.name.split(".").pop()
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        })

      if (uploadError) {
        // If storage bucket doesn't exist, show helpful message
        if (uploadError.message.includes("Bucket not found")) {
          toast.error("Avatar storage not configured. Please contact support.")
          return
        }
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id)

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      toast.success("Avatar updated successfully!")
      router.refresh()
    } catch (error) {
      console.error("[ProfileSettings] Avatar upload error:", error)
      toast.error(error instanceof Error ? error.message : "Failed to upload avatar")
    } finally {
      setIsUploadingAvatar(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        throw new Error("Service unavailable")
      }

      // Update profile to remove avatar URL
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profile.id)

      if (error) throw error

      setAvatarUrl("")
      toast.success("Avatar removed")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove avatar")
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopied(true)
      toast.success("User ID copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy User ID")
    }
  }

  const checkUsernameAvailability = async (newUsername: string) => {
    if (!newUsername || newUsername === profile.username) {
      setUsernameAvailable(null)
      setUsernameError(null)
      return
    }

    if (newUsername.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      setUsernameAvailable(false)
      return
    }

    if (newUsername.length > 20) {
      setUsernameError("Username must be 20 characters or less")
      setUsernameAvailable(false)
      return
    }

    // Validate format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    if (!usernameRegex.test(newUsername)) {
      setUsernameError("Only letters, numbers, and underscores allowed")
      setUsernameAvailable(false)
      return
    }

    setIsCheckingUsername(true)
    setUsernameError(null)

    try {
      const response = await fetch(
        `/api/username/check?username=${encodeURIComponent(newUsername)}&userId=${encodeURIComponent(profile.id)}`,
      )

      if (!response.ok) {
        const errorData = await response.json()
        setUsernameError(errorData.error || "Could not check username availability")
        setUsernameAvailable(null)
        return
      }

      const data = await response.json()

      if (data.reason) {
        setUsernameError(data.reason)
        setUsernameAvailable(false)
      } else if (data.available) {
        setUsernameAvailable(true)
        setUsernameError(null)
      } else {
        setUsernameError("This username is already taken")
        setUsernameAvailable(false)
      }
    } catch {
      setUsernameError("Could not check username availability")
      setUsernameAvailable(null)
    } finally {
      setIsCheckingUsername(false)
    }
  }

  const handleUsernameChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "")
    setUsername(sanitized)
    setUsernameAvailable(null)
    setUsernameError(null)

    // Debounce the availability check
    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(sanitized)
    }, 500)

    return () => clearTimeout(timeoutId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (username && username !== profile.username && !usernameAvailable) {
      toast.error("Please choose an available username")
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()

      const updateData: Record<string, string | null> = {}

      // Only include display_name if it changed
      if (displayName !== (profile.display_name || "")) {
        updateData.display_name = displayName.trim() || null
      }

      // Only include username if it changed
      if (username !== (profile.username || "")) {
        updateData.username = username.trim().toLowerCase() || null
      }

      // If nothing changed, just show success
      if (Object.keys(updateData).length === 0) {
        toast.success("No changes to save")
        setIsLoading(false)
        return
      }

      const { error } = await supabase.from("profiles").update(updateData).eq("id", profile.id).select()

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation
          if (error.message?.includes("username")) {
            toast.error("This username is already taken")
          } else {
            toast.error("A unique constraint was violated. Please try different values.")
          }
        } else if (error.code === "42501") {
          // RLS policy violation
          toast.error("You don't have permission to update this profile")
        } else if (error.code === "PGRST116") {
          // No rows returned (shouldn't happen but handle it)
          toast.error("Profile not found")
        } else {
          toast.error(error.message || "Failed to update profile")
        }
        return
      }

      toast.success("Profile updated successfully")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar Upload Section */}
      <div className="space-y-3">
        <Label>Profile Photo</Label>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarUrl || undefined} alt={displayName || "Profile"} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Overlay on hover */}
            <div
              className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-6 w-6 text-white" />
            </div>
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              disabled={isUploadingAvatar}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="gap-2"
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload Photo
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveAvatar}
                disabled={isUploadingAvatar}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Recommended: Square image, at least 200x200px. Max 2MB.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="userId">User ID</Label>
        <div className="flex gap-2">
          <Input id="userId" value={profile.id} readOnly className="bg-muted font-mono text-xs sm:text-sm" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copyUserId}
            className="shrink-0 bg-transparent"
            aria-label="Copy User ID"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your unique identifier. Share this with support if you need help.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">Email cannot be changed</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          placeholder="Your display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={isLoading}
          maxLength={50}
        />
        <p className="text-xs text-muted-foreground">How others will see you on the platform</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <Input
            id="username"
            placeholder="unique_username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            disabled={isLoading}
            maxLength={30}
            className={usernameError ? "border-red-500 pr-10" : usernameAvailable ? "border-green-500 pr-10" : ""}
          />
          {isCheckingUsername && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isCheckingUsername && usernameAvailable && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
          )}
          {!isCheckingUsername && usernameError && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
          )}
        </div>
        {usernameError ? (
          <p className="text-xs text-red-500">{usernameError}</p>
        ) : usernameAvailable ? (
          <p className="text-xs text-green-500">Username is available!</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and underscores only (3-20 characters)
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isLoading || isCheckingUsername || (username !== profile.username && usernameAvailable === false)}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </form>
  )
}
