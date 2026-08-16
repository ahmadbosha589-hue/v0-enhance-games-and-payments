"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileSettings } from "@/components/dashboard/profile-settings"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { User, Calendar, Trophy, Flame, Coins, Users, AlertCircle, TrendingUp, Clock, Star, RefreshCw, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { maskEmail } from "@/lib/utils/mask-email"
import { Skeleton } from "@/components/ui/skeleton"

interface Profile {
  id: string
  username?: string
  display_name?: string
  avatar_url?: string
  role?: string
  is_verified?: boolean
  balance_satoshis: number
  total_withdrawn_satoshis?: number
  total_claims?: number
  claim_streak?: number
  max_claim_streak?: number
  referral_count?: number
  created_at?: string
  last_claim_at?: string
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">View and manage your profile</p>
      </div>

      {/* Profile Header Skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <Skeleton className="h-20 w-20 sm:h-24 sm:w-24 rounded-full" />
            <div className="text-center sm:text-left flex-1 space-y-2">
              <Skeleton className="h-8 w-48 mx-auto sm:mx-0" />
              <Skeleton className="h-4 w-32 mx-auto sm:mx-0" />
              <Skeleton className="h-4 w-40 mx-auto sm:mx-0" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4 px-3 sm:px-4">
              <div className="flex flex-col items-center text-center gap-1">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Profile Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">View and manage your profile</p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to Load Profile</AlertTitle>
        <AlertDescription>
          <p className="mb-3">We couldn&apos;t load your profile data. Please try again.</p>
          <Button size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function NotLoggedInState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">View and manage your profile</p>
      </div>
      <Alert>
        <User className="h-4 w-4" />
        <AlertTitle>Not Logged In</AlertTitle>
        <AlertDescription>
          <p className="mb-3">Please log in to view your profile.</p>
          <Button size="sm" asChild>
            <Link href="/auth/login?redirect=/dashboard/profile">Log In</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function formatSatoshis(satoshis: number): string {
  if (satoshis >= 100000000) {
    return `${(satoshis / 100000000).toFixed(4)} BTC`
  }
  return `${satoshis.toLocaleString()} sats`
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = async () => {
    setLoading(true)
    setError(false)

    try {
      // Use the /api/profile endpoint — it runs auth server-side (same mechanism
      // as the admin panel) so it never hangs on client-side getSession()/getUser().
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let response: Response
      try {
        response = await fetch("/api/profile", { signal: controller.signal })
      } finally {
        clearTimeout(timeoutId)
      }

      if (response.status === 401) {
        // Genuinely not logged in
        setUser(null)
        setProfile(null)
        return
      }

      if (!response.ok) {
        console.error("[ProfilePage] API error:", response.status)
        setError(true)
        return
      }

      const data = await response.json()

      if (!data.profile) {
        setError(true)
        return
      }

      setUser({ id: data.profile.id, email: data.profile.email })
      setProfile(data.profile)
    } catch (err) {
      console.error("[ProfilePage] Error:", err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  if (loading) {
    return <ProfileSkeleton />
  }

  if (error) {
    return <ProfileErrorState onRetry={loadProfile} />
  }

  if (!user) {
    return <NotLoggedInState />
  }

  if (!profile) {
    return <ProfileErrorState onRetry={loadProfile} />
  }

  const memberSince = profile.created_at
    ? formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })
    : "Recently"

  const lastActive = profile.last_claim_at
    ? formatDistanceToNow(new Date(profile.last_claim_at), { addSuffix: true })
    : "Never"

  const stats = [
    {
      label: "Total Earned",
      value: formatSatoshis(profile.balance_satoshis + (profile.total_withdrawn_satoshis || 0)),
      icon: Coins,
      color: "text-yellow-500",
    },
    {
      label: "Current Balance",
      value: formatSatoshis(profile.balance_satoshis),
      icon: TrendingUp,
      color: "text-green-500",
    },
    {
      label: "Total Claims",
      value: profile.total_claims?.toLocaleString() || "0",
      icon: Trophy,
      color: "text-blue-500",
    },
    {
      label: "Current Streak",
      value: `${profile.claim_streak || 0} days`,
      icon: Flame,
      color: "text-orange-500",
    },
    {
      label: "Max Streak",
      value: `${profile.max_claim_streak || 0} days`,
      icon: Star,
      color: "text-purple-500",
    },
    {
      label: "Referrals",
      value: profile.referral_count?.toLocaleString() || "0",
      icon: Users,
      color: "text-cyan-500",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">View and manage your profile</p>
        </div>
        <Button variant="ghost" size="icon" onClick={loadProfile} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-primary/20">
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {(profile.display_name || profile.username || user.email || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold">
                  {profile.display_name || profile.username || "Anonymous User"}
                </h2>
                <Badge variant={profile.role === "admin" || profile.role === "superadmin" ? "default" : "secondary"}>
                  {profile.role || "user"}
                </Badge>
                {profile.is_verified && (
                  <Badge variant="outline" className="border-green-500 text-green-500">
                    Verified
                  </Badge>
                )}
              </div>
              {profile.username && <p className="text-muted-foreground">@{profile.username}</p>}
              <p className="text-sm text-muted-foreground mt-1">{maskEmail(user.email, true)}</p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Joined {memberSince}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Last active {lastActive}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-4 px-3 sm:px-4">
              <div className="flex flex-col items-center text-center gap-1">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <p className="text-lg sm:text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <User className="h-5 w-5" />
            Edit Profile
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Update your profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileSettings profile={profile} email={user.email || ""} />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/settings">Account Settings</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/referrals">Referral Program</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/history">Transaction History</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/achievements">Achievements</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}