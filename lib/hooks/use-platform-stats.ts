"use client"

import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"

export interface PlatformStats {
  total_distributed_satoshis: number
  total_distributed_btc: number
  total_users: number
  total_claims: number
  today_claims: number
}

const fetcher = async (): Promise<PlatformStats> => {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("get_platform_stats")

  if (error) {
    // Return zeros if the function doesn't exist yet
    return {
      total_distributed_satoshis: 0,
      total_distributed_btc: 0,
      total_users: 0,
      total_claims: 0,
      today_claims: 0,
    }
  }

  return data as PlatformStats
}

export function usePlatformStats() {
  const { data, error, isLoading, mutate } = useSWR<PlatformStats>("platform-stats", fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true,
    dedupingInterval: 10000,
  })

  return {
    stats: data,
    isLoading,
    error,
    refresh: mutate,
  }
}
