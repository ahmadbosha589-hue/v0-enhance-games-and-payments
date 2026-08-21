"use client"

import useSWR from "swr"

export interface PlatformStats {
  total_distributed_satoshis: number
  total_distributed_btc: number
  total_users: number
  total_claims: number
  today_claims: number
}

const fetcher = async (): Promise<PlatformStats> => {
  const response = await fetch("/api/stats", { cache: "no-store", credentials: "include" })
  if (!response.ok) throw new Error("Platform stats unavailable")

  const data = await response.json() as {
    isLive?: boolean
    totalDistributed?: number
    totalUsers?: number
    totalClaims?: number
    todayClaims?: number
  }

  if (!data.isLive) throw new Error("Platform stats unavailable")

  const totalDistributed = Number(data.totalDistributed) || 0
  return {
    total_distributed_satoshis: totalDistributed,
    total_distributed_btc: totalDistributed / 100_000_000,
    total_users: Number(data.totalUsers) || 0,
    total_claims: Number(data.totalClaims) || 0,
    today_claims: Number(data.todayClaims) || 0,
  }
}

export function usePlatformStats() {
  const { data, error, isLoading, mutate } = useSWR<PlatformStats>("platform-stats", fetcher, {
    refreshInterval: 30000,
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
