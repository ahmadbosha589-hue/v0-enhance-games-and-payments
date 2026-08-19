"use client"

import useSWR from "swr"

export interface PublicAdNetworkConfig {
  enabled?: boolean
  publisherId?: string
  zoneId?: string
  slotId?: string
  [key: string]: unknown
}

export interface PublicAdSlotSettings {
  provider?: string
  enabled?: boolean
  aads_id?: string
  coinzilla_zone?: string
  bitsmedia_id?: string
  bitsmedia_slot?: string
}

interface AdConfigResponse {
  configs?: Record<string, PublicAdNetworkConfig>
  adSettings?: Record<string, PublicAdSlotSettings>
}

const fetcher = (url: string): Promise<AdConfigResponse> =>
  fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Ad config request failed: ${response.status}`)
    return response.json() as Promise<AdConfigResponse>
  })

/**
 * Shared client cache for the public, sanitized ad configuration endpoint.
 * Every ad slot on a page uses the same SWR key and in-flight request.
 */
export function useAdConfig(enabled = true) {
  const result = useSWR<AdConfigResponse>(enabled ? "/api/ads/config" : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  return {
    configs: result.data?.configs ?? null,
    adSettings: result.data?.adSettings ?? null,
    isLoading: enabled && !result.data && !result.error,
    error: result.error,
  }
}
