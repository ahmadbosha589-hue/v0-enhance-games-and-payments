"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { formatSatoshisDisplay, formatRelativeTime } from "@/lib/utils/format"
import { Users } from "lucide-react"

interface Referral {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  total_claims: number
  total_earned_satoshis: number
  last_active_at: string | null
}

interface ReferralListProps {
  referrals: Referral[]
}

export function ReferralList({ referrals }: ReferralListProps) {
  if (referrals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">No referrals yet</h3>
        <p className="text-sm text-muted-foreground">Share your link to invite friends</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {referrals.map((referral) => {
        const isActive =
          referral.last_active_at && new Date(referral.last_active_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)

        return (
          <div key={referral.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={referral.avatar_url || undefined} />
                <AvatarFallback>{referral.display_name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{referral.display_name || "Anonymous User"}</p>
                  {isActive && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/50">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Joined {formatRelativeTime(referral.created_at)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{referral.total_claims} claims</p>
              <p className="text-xs text-muted-foreground">
                {formatSatoshisDisplay(referral.total_earned_satoshis)} earned
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
