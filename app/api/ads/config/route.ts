import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Default ad network configurations (used if not configured in database)
const DEFAULT_CONFIGS: Record<string, any> = {
  google: {
    enabled: true,
    publisherId: process.env.GOOGLE_ADSENSE_PUBLISHER_ID || "",
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

export async function GET() {
  try {
    const adminSupabase = createAdminClient()
    
    if (!adminSupabase) {
      // Return default configs if database not available
      return NextResponse.json({ configs: DEFAULT_CONFIGS })
    }

    // Try to fetch from database
    const { data: dbConfigs } = await adminSupabase
      .from("ad_network_configs")
      .select("*")
      .eq("enabled", true)

    // Merge database configs with defaults
    const configs = { ...DEFAULT_CONFIGS }
    
    if (dbConfigs && dbConfigs.length > 0) {
      for (const config of dbConfigs) {
        if (config.network_id && configs[config.network_id]) {
          configs[config.network_id] = {
            ...configs[config.network_id],
            enabled: config.enabled,
            // Decrypt sensitive fields would happen here in production
            ...config.settings,
          }
        }
      }
    }

    // Remove sensitive data that shouldn't be exposed to client
    const sanitizedConfigs = Object.entries(configs).reduce((acc, [key, value]) => {
      acc[key] = {
        enabled: value.enabled,
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

    return NextResponse.json({ configs: sanitizedConfigs })
  } catch (error) {
    console.error("Error fetching ad configs:", error)
    return NextResponse.json({ configs: DEFAULT_CONFIGS })
  }
}
