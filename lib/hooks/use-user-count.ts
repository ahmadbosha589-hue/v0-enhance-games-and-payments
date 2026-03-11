"use client"

import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"

const fetcher = async (): Promise<number> => {
  const supabase = createClient()
  const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true })

  if (error) {
    console.error("Error fetching user count:", error)
    return 0
  }

  return count || 0
}

export function useUserCount() {
  const { data, error, isLoading } = useSWR("user-count", fetcher, {
    refreshInterval: 60000, // Refresh every minute
    revalidateOnFocus: true,
    dedupingInterval: 30000,
    fallbackData: 0,
  })

  return {
    count: data ?? 0,
    isLoading,
    error,
  }
}

export function formatUserCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M+`
  if (count >= 1000) return `${Math.floor(count / 1000).toLocaleString()}K+`
  if (count > 0) return `${count}+`
  return "0"
}
