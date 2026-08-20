import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptNetworkConfig, parseNetworkConfig } from "@/lib/ads/network-config-crypto"
import { isNetworkRenderable, providerNetworkId } from "@/lib/ads/registry"

// Default ad network configurations (used if not configured in database)
const DEFAULT_CONFIGS: Record<string, any> = {
  google: {
    enabled: true,
    publisherId: process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || process.env.GOOGLE_ADSENSE_PUBLISHER_ID || "",
    defaultSlot: process.env.GOOGLE_ADSENSE_SLOT_ID || "",
    adSlots: {
      header: process.env.GOOGLE_ADSENSE_HEADER_SLOT || "",
      sidebar: process.env.GOOGLE_ADSENSE_SIDEBAR_SLOT || "",
      content: process.env.GOOGLE_ADSENSE_CONTENT_SLOT || "",
      footer: process.env.GOOGLE_ADSENSE_FOOTER_SLOT || "",
    }
  },
  "a-ads": {
    enabled: !!process.env.A_ADS_PUBLISHER_ID,
    publisherId: process.env.A_ADS_PUBLISHER_ID || "",
  },
  coinzilla: {
    enabled: !!process.env.COINZILLA_ZONE_ID,
    zoneId: process.env.COINZILLA_ZONE_ID || "",
  },
  bitmedia: {
    enabled: !!process.env.BITMEDIA_ZONE_ID,
    zoneId: process.env.BITMEDIA_ZONE_ID || "",
  },
  cointraffic: {
    enabled: !!process.env.COINTRAFFIC_PUBLISHER_ID,
    publisherId: process.env.COINTRAFFIC_PUBLISHER_ID || "",
    zoneId: process.env.COINTRAFFIC_ZONE_ID || "",
  },
  medianet: {
    enabled: !!process.env.MEDIANET_CID,
    cid: process.env.MEDIANET_CID || "",
    crid: process.env.MEDIANET_CRID || "",
  },
  hilltopads: {
    enabled: !!process.env.HILLTOPADS_ZONE_ID,
    zoneId: process.env.HILLTOPADS_ZONE_ID || "",
  },
  adsterra: {
    enabled: !!process.env.ADSTERRA_PUBLISHER_ID,
    publisherId: process.env.ADSTERRA_PUBLISHER_ID || "",
    slotId: process.env.ADSTERRA_SLOT_ID || "",
  },
  propellerads: {
    enabled: !!process.env.PROPELLERADS_ZONE_ID,
    zoneId: process.env.PROPELLERADS_ZONE_ID || "",
  },
  trafficstars: {
    enabled: !!process.env.TRAFFICSTARS_ZONE_ID,
    zoneId: process.env.TRAFFICSTARS_ZONE_ID || "",
  },
  mellowads: {
    enabled: !!process.env.MELLOWADS_ZONE_ID,
    zoneId: process.env.MELLOWADS_ZONE_ID || "",
  },
  adskeeper: {
    enabled: !!process.env.ADSKEEPER_SITE_ID,
    siteId: process.env.ADSKEEPER_SITE_ID || "",
    widgetId: process.env.ADSKEEPER_WIDGET_ID || "",
  },
}

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
}

function configResponse(
  configs: Record<string, unknown>,
  adSettings: Record<string, unknown> = {},
) {
  return NextResponse.json({ configs, adSettings }, { headers: CACHE_HEADERS })
}

export const dynamic = "force-dynamic"
export const revalidate = 300

export async function GET() {
  try {
    const adminSupabase = createAdminClient()
    
    if (!adminSupabase) {
      // Return default configs if database not available
      return configResponse(DEFAULT_CONFIGS)
    }

    // Try to fetch from database. NOTE: we intentionally do NOT filter on
    // `.eq("enabled", true)` here — a network the admin has since disabled
    // still needs to come through (with enabled: false) so it overrides
    // whatever the env-var default computed, otherwise a network that was
    // enabled via env vars but explicitly disabled in the admin panel
    // would incorrectly keep rendering.
    const { data: dbConfigs } = await adminSupabase
      .from("ad_network_configs")
      .select("network_id, encrypted_config, enabled")

    // The admin panel (components/admin/ad-network-settings.tsx) and the
    // public ad slot components (AD_NETWORKS in
    // components/ads/ad-slot-multi-network.tsx / multi-network-ads.tsx)
    // use slightly different ids for the same two networks. Normalize so
    // an admin-saved config actually reaches the slot that renders it.
    const NETWORK_ID_ALIASES: Record<string, string> = {
      google_ads: "google",
      a_ads: "a-ads",
    }

    // The admin form (components/admin/ad-network-settings.tsx) collects
    // credentials under human-readable, env-var-style keys (e.g.
    // "COINTRAFFIC_ZONE_ID") that mirror the equivalent environment
    // variable names for self-hosters. The renderer (ad-slot-multi-network
    // .tsx / multi-network-ads.tsx) and DEFAULT_CONFIGS above both read a
    // small canonical camelCase shape (publisherId, zoneId, slotId, cid,
    // crid, siteId, widgetId). Bridge the two so a config saved through
    // the admin UI actually renders — without this, `settings` below is
    // spread in as-is with keys the renderer never looks at, which is
    // functionally identical to the network never having been configured.
    const FIELD_KEY_MAP: Record<string, Record<string, string>> = {
      google: {
        GOOGLE_ADS_CLIENT_ID: "publisherId",
        GOOGLE_ADS_SLOT_BANNER: "defaultSlot",
      },
      cointraffic: {
        COINTRAFFIC_ZONE_ID: "zoneId",
        COINTRAFFIC_BANNER_ID: "publisherId",
      },
      medianet: {
        MEDIANET_CUSTOMER_ID: "cid",
        MEDIANET_WIDGET_ID: "crid",
      },
      hilltopads: {
        HILLTOPADS_ZONE_ID: "zoneId",
      },
      adsterra: {
        ADSTERRA_BANNER_KEY: "slotId",
        ADSTERRA_NATIVE_KEY: "publisherId",
      },
      propellerads: {
        PROPELLERADS_ZONE_ID: "zoneId",
      },
      trafficstars: {
        TRAFFICSTARS_SPOT_ID: "zoneId",
      },
      adskeeper: {
        ADSKEEPER_WIDGET_ID: "widgetId",
        ADSKEEPER_SITE_ID: "siteId",
      },
      "a-ads": {
        A_ADS_UNIT_ID: "publisherId",
      },
      coinzilla: {
        COINZILLA_ZONE_ID: "zoneId",
      },
      bitmedia: {
        BITMEDIA_ZONE_ID: "zoneId",
      },
      mellowads: {
        MELLOWADS_AD_ID: "zoneId",
      },
    }

    function normalizeSettings(networkId: string, raw: Record<string, unknown>) {
      const map = FIELD_KEY_MAP[networkId]
      if (!map) return raw
      const out: Record<string, unknown> = {}
      for (const [rawKey, value] of Object.entries(raw)) {
        out[map[rawKey] || rawKey] = value
      }
      return out
    }

    // Merge database configs with defaults
    const configs = { ...DEFAULT_CONFIGS }

    if (dbConfigs && dbConfigs.length > 0) {
      for (const row of dbConfigs) {
        const networkId = NETWORK_ID_ALIASES[row.network_id] || row.network_id
        if (!networkId) continue

        // Decrypt the credentials the admin saved (see
        // lib/ads/network-config-crypto.ts). Previously this spread
        // `config.settings`, a column that has never existed on
        // `ad_network_configs` — so admin-configured networks (as opposed
        // to env-var-configured ones) never actually took effect here.
        const decrypted = row.encrypted_config
          ? decryptNetworkConfig(row.encrypted_config)
          : null
        const settings = normalizeSettings(networkId, parseNetworkConfig(decrypted))

        configs[networkId] = {
          ...(configs[networkId] || {}),
          ...settings,
          enabled: row.enabled,
        }
      }
    }

    // Position-level legacy ad settings are folded into this same public,
    // sanitized response so clients never query Supabase directly per slot.
    const { data: positionRows } = await adminSupabase
      .from("ad_settings")
      .select("position, provider, enabled, aads_id, coinzilla_zone, bitsmedia_id, bitsmedia_slot")

    const adSettings = (positionRows || []).reduce((acc, row) => {
      if (!row.position || !row.provider || !isNetworkRenderable(providerNetworkId(row.provider) || "")) return acc
      acc[row.position] = {
        provider: row.provider,
        enabled: row.enabled,
        aads_id: row.aads_id || undefined,
        coinzilla_zone: row.coinzilla_zone || undefined,
        bitsmedia_id: row.bitsmedia_id || undefined,
        bitsmedia_slot: row.bitsmedia_slot || undefined,
      }
      return acc
    }, {} as Record<string, unknown>)

    // Remove sensitive data that shouldn't be exposed to client
    const sanitizedConfigs = Object.entries(configs).reduce((acc, [key, value]) => {
      acc[key] = {
        enabled: Boolean(value.enabled && isNetworkRenderable(key)),
        publisherId: value.publisherId || "",
        zoneId: value.zoneId || "",
        slotId: value.slotId || value.defaultSlot || "",
        adSlots: value.adSlots || {},
        cid: value.cid || "",
        crid: value.crid || "",
        siteId: value.siteId || "",
        widgetId: value.widgetId || "",
      }
      return acc
    }, {} as Record<string, any>)

    return configResponse(sanitizedConfigs, adSettings)
  } catch (error) {
    console.error("Error fetching ad configs:", error)
    return configResponse(DEFAULT_CONFIGS)
  }
}
