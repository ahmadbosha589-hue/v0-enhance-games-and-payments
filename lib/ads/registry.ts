/**
 * Canonical publisher-network registry.
 *
 * A network is disabled until its exact publisher tag has been verified against
 * the provider's current documentation and observed rendering with real account
 * configuration. Do not flip `enabled` to true merely because an environment
 * variable or zone id exists: the previous implementation shipped invented
 * iframe URLs and empty containers for several vendors.
 */
export type TagKind =
  | "script-global"
  | "script-inline"
  | "iframe-src"
  | "iframe-srcdoc"
  | "container-only"

export interface NetworkField {
  key: string
  envVar: string
  adminLabel: string
  required: boolean
  secret?: boolean
}

export interface AdNetwork {
  id: string
  name: string
  enabled: boolean
  disabledReason?: string
  tagKind: TagKind
  allowsIncentivized: boolean
  fields: readonly NetworkField[]
  sizes: readonly { w: number; h: number }[]
  refreshMs: number
  scriptOrigin?: string
  legacyProvider?: "aads" | "coinzilla" | "bitsmedia"
}

const UNVERIFIED = "disabled: exact publisher tag is not verified against current vendor documentation"

// These three networks' render tags are implemented in the live components and
// exercised by the CSP contract tests (tests/security/csp-enforced.test.ts):
//   a-ads      → components/ads/ad-banner.tsx + ad-slot-multi-network.tsx (script + iframe)
//   coinzilla  → coinzillatag.com/lib/display.js (script)
//   bitmedia   → bitmedia.io/embed/<zoneId> (iframe, tagKind corrected to iframe-src)
// Admin-saved credentials for them flow through /api/ads/config and actually
// render once enabled. Every other network below stays disabled until its
// exact publisher tag is implemented and verified.
export const AD_NETWORKS: readonly AdNetwork[] = [
  {
    id: "a-ads",
    name: "A-ADS",
    enabled: true,
    tagKind: "script-global",
    allowsIncentivized: false,
    legacyProvider: "aads",
    fields: [{ key: "publisherId", envVar: "A_ADS_PUBLISHER_ID", adminLabel: "Publisher/unit ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 468, h: 60 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://a-ads.com",
  },
  {
    id: "coinzilla",
    name: "CoinZilla",
    enabled: true,
    tagKind: "script-global",
    allowsIncentivized: false,
    legacyProvider: "coinzilla",
    fields: [{ key: "zoneId", envVar: "COINZILLA_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://coinzillatag.com",
  },
  {
    id: "bitmedia",
    name: "Bitmedia",
    enabled: true,
    tagKind: "iframe-src",
    allowsIncentivized: false,
    legacyProvider: "bitsmedia",
    fields: [{ key: "zoneId", envVar: "BITMEDIA_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://bitmedia.io",
  },
  {
    id: "cointraffic",
    name: "Cointraffic",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [{ key: "zoneId", envVar: "COINTRAFFIC_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://cointraffic.io",
  },
  {
    id: "medianet",
    name: "Media.net",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [
      { key: "cid", envVar: "MEDIANET_CID", adminLabel: "Customer ID", required: true },
      { key: "crid", envVar: "MEDIANET_CRID", adminLabel: "Widget ID", required: true },
    ],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://contextual.media.net",
  },
  {
    id: "hilltopads",
    name: "HilltopAds",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [{ key: "zoneId", envVar: "HILLTOPADS_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://hilltopads.com",
  },
  {
    id: "adsterra",
    name: "Adsterra",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-inline",
    allowsIncentivized: false,
    fields: [{ key: "slotId", envVar: "ADSTERRA_SLOT_ID", adminLabel: "Placement key", required: true, secret: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://www.adsterra.com",
  },
  {
    id: "propellerads",
    name: "PropellerAds",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [{ key: "zoneId", envVar: "PROPELLERADS_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://propellerads.com",
  },
  {
    id: "trafficstars",
    name: "TrafficStars",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "iframe-src",
    allowsIncentivized: false,
    fields: [{ key: "zoneId", envVar: "TRAFFICSTARS_ZONE_ID", adminLabel: "Spot ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://tsyndicate.com",
  },
  {
    id: "mellowads",
    name: "MellowAds",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [{ key: "zoneId", envVar: "MELLOWADS_ZONE_ID", adminLabel: "Zone ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://ads.mellowads.com",
  },
  {
    id: "adskeeper",
    name: "AdsKeeper",
    enabled: false,
    disabledReason: UNVERIFIED,
    tagKind: "container-only",
    allowsIncentivized: false,
    fields: [{ key: "widgetId", envVar: "ADSKEEPER_WIDGET_ID", adminLabel: "Widget ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://jsc.adskeeper.com",
  },
  {
    id: "google",
    name: "Google AdSense",
    enabled: false,
    disabledReason: "disabled: AdSense must not run on incentivized/reward surfaces; publisher approval and consent verification are still pending",
    tagKind: "script-global",
    allowsIncentivized: false,
    fields: [{ key: "publisherId", envVar: "GOOGLE_ADSENSE_PUBLISHER_ID", adminLabel: "Publisher ID", required: true }],
    sizes: [{ w: 300, h: 250 }, { w: 728, h: 90 }],
    refreshMs: 0,
    scriptOrigin: "https://pagead2.googlesyndication.com",
  },
]

export function getNetwork(id: string): AdNetwork | undefined {
  return AD_NETWORKS.find((network) => network.id === id)
}

export function isNetworkRenderable(id: string): boolean {
  return getNetwork(id)?.enabled === true
}

export function enabledNetworks(): AdNetwork[] {
  return AD_NETWORKS.filter((network) => network.enabled)
}

export function adScriptOrigins(): string[] {
  return [...new Set(enabledNetworks().flatMap((network) => network.scriptOrigin ? [network.scriptOrigin] : []))]
}

export function adFrameOrigins(): string[] {
  return [...new Set(enabledNetworks().filter((network) => network.tagKind === "iframe-src").flatMap((network) => network.scriptOrigin ? [network.scriptOrigin] : []))]
}

export function providerNetworkId(provider: string): string | undefined {
  return AD_NETWORKS.find((network) => network.legacyProvider === provider)?.id
}
