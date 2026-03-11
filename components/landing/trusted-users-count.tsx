"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/language-context"

interface TrustedUsersCountProps {
  className?: string
}

export function TrustedUsersCount({ className }: TrustedUsersCountProps) {
  const { t } = useLanguage()
  const [userCount, setUserCount] = useState<number | null>(null)

  useEffect(() => {
    async function fetchUserCount() {
      try {
        const response = await fetch("/api/stats")
        if (response.ok) {
          const data = await response.json()
          setUserCount(data.totalUsers || 0)
        }
      } catch (error) {
        console.error("Failed to fetch user count:", error)
      }
    }

    fetchUserCount()
  }, [])

  // Format user count nicely
  function formatCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M+`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(0)}K+`
    }
    if (count > 0) {
      return `${count}+`
    }
    return ""
  }

  // Generate the display text
  function getDisplayText(): string {
    if (userCount === null) {
      // Loading state - show generic text
      return t("hero.trust.trustedGeneric", "Trusted Platform")
    }
    
    if (userCount === 0) {
      // No users yet - show generic text
      return t("hero.trust.trustedGeneric", "Trusted Platform")
    }

    // Has users - show count
    const formattedCount = formatCount(userCount)
    return t("hero.trust.trustedWithCount", `Trusted by ${formattedCount} Users`).replace("{count}", formattedCount)
  }

  return (
    <span className={className}>
      {getDisplayText()}
    </span>
  )
}
