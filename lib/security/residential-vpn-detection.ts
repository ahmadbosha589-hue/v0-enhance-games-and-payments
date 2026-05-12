// =============================================================================
// =============================================================================
// RESIDENTIAL / DECENTRALIZED VPN DETECTION v1.0 (2026)
// =============================================================================
// =============================================================================
//
// Designed to catch VPNs that route through real residential IPs and therefore
// EVADE IP-reputation databases. Target threats include:
//
//   - Deeper Network DPN (residential mesh, no central exit)
//   - Anomi VPN / X-VPN / Tachyon Protocol (P2P SDK)
//   - Mysterium Network (decentralized dVPN)
//   - Hola VPN (P2P residential)
//   - Honeygain / EarnApp / PacketStream / Pawns (residential SDK exits)
//   - Bright Data / Oxylabs / SOAX residential proxy users
//   - "Clean-DNS" / flushed-DNS VPN setups (hacker tooling)
//   - Custom WireGuard tunnels on residential VPS (DIY hacker VPN)
//
// STRATEGY: behavioral fingerprinting. A real residential user has consistent
// latency/RTT, matching timezone, single public IP, and ASN that matches their
// claimed geo. Residential-VPN users typically break at least 2 of those.
//
// IMPORTANT: This module ONLY produces signals - it never blocks alone. The
// signals are fed into the VPN Fortress consensus engine, which combines them
// with API/ASN/Tor signals to make a final decision (zero false positives).
// =============================================================================

import { log } from "@/lib/logger"

export interface BehavioralSignal {
  type: string
  weight: number // 0-100 - how strong this signal is
  confidence: number // 0-100 - how confident we are in the measurement
  metadata?: Record<string, unknown>
}

export interface ResidentialVPNResult {
  /** Composite suspicion score 0-100. Used as input to the fortress consensus. */
  score: number
  /** Per-signal breakdown for transparency / debugging */
  signals: BehavioralSignal[]
  /** Whether enough independent signals fired to count as "residential-VPN suspect" */
  isSuspect: boolean
  /** Confidence that this user is on a residential VPN/dVPN/mesh */
  confidence: number
  /** Reason strings for logging / UI */
  reasons: string[]
}

export interface ResidentialVPNInputs {
  /** Server-observed client IP */
  clientIP: string
  /** WebRTC-discovered IPs (from the browser) */
  webrtcIPs?: string[]
  /** IANA timezone reported by the browser */
  timezone?: string
  /** Country code resolved from IP (ISO-2) */
  ipCountry?: string
  /** ISP/Org/ASN data resolved from IP */
  isp?: string
  org?: string
  asn?: string
  /** Latency measurements (ms) collected to 2-3 anchor regions */
  latencyMeasurements?: {
    region: string
    ms: number
  }[]
  /** Effective connection type reported by NetworkInformation API */
  effectiveType?: string
  /** Round-trip time reported by NetworkInformation API (ms) */
  navigatorRTT?: number
  /** Downlink Mbps reported by NetworkInformation API */
  downlink?: number
  /** Hardware concurrency (CPU cores) */
  hardwareConcurrency?: number
  /** Device memory in GB */
  deviceMemory?: number
  /** User agent */
  userAgent?: string
  /** Platform reported by navigator.platform */
  platform?: string
  /** Browser languages */
  languages?: string[]
  /** Whether canvas is "farbled" (Brave/Tor signature) */
  canvasFarbled?: boolean
}

// =============================================================================
// REGIONAL LATENCY EXPECTATIONS (ms ± tolerance)
// =============================================================================
//
// A normal residential user in country X has roughly predictable RTT to known
// anchor regions. If the latency profile DOES NOT match the country-of-IP, the
// user is almost certainly tunneling through somewhere else (i.e. on a VPN).
//
// Tolerances are generous so we never flag legitimate users on bad ISPs.
// =============================================================================

const COUNTRY_TO_REGION: Record<string, "NA-E" | "NA-W" | "EU-W" | "EU-E" | "AS-E" | "AS-S" | "AU" | "SA" | "AF" | "ME"> = {
  US: "NA-E", CA: "NA-E", MX: "NA-E",
  GB: "EU-W", IE: "EU-W", FR: "EU-W", DE: "EU-W", NL: "EU-W", BE: "EU-W",
  IT: "EU-W", ES: "EU-W", PT: "EU-W", CH: "EU-W", AT: "EU-W", DK: "EU-W",
  SE: "EU-W", NO: "EU-W", FI: "EU-W",
  PL: "EU-E", CZ: "EU-E", RO: "EU-E", BG: "EU-E", HU: "EU-E", UA: "EU-E",
  RU: "EU-E",
  JP: "AS-E", KR: "AS-E", CN: "AS-E", TW: "AS-E", HK: "AS-E", SG: "AS-E",
  IN: "AS-S", PK: "AS-S", BD: "AS-S", TH: "AS-S", VN: "AS-S", PH: "AS-S",
  MY: "AS-S", ID: "AS-S",
  AU: "AU", NZ: "AU",
  BR: "SA", AR: "SA", CL: "SA", CO: "SA", PE: "SA",
  ZA: "AF", NG: "AF", KE: "AF", EG: "AF", MA: "AF",
  AE: "ME", SA: "ME", IL: "ME", TR: "ME",
}

// Expected RTT in ms from a residential user in REGION-X to ANCHOR-Y
// (rough cross-Atlantic / cross-Pacific baselines from real-world measurement)
const REGIONAL_RTT_EXPECTATIONS: Record<string, Record<string, [number, number]>> = {
  // anchor: us-east, anchor: eu-west, anchor: asia-east
  "NA-E": { "us-east": [5, 80], "eu-west": [70, 140], "asia-east": [140, 230] },
  "NA-W": { "us-east": [50, 110], "eu-west": [120, 200], "asia-east": [80, 160] },
  "EU-W": { "us-east": [70, 140], "eu-west": [5, 50], "asia-east": [180, 280] },
  "EU-E": { "us-east": [90, 170], "eu-west": [20, 70], "asia-east": [180, 290] },
  "AS-E": { "us-east": [140, 230], "eu-west": [180, 280], "asia-east": [5, 50] },
  "AS-S": { "us-east": [180, 290], "eu-west": [120, 220], "asia-east": [40, 110] },
  "AU":   { "us-east": [160, 270], "eu-west": [240, 340], "asia-east": [90, 170] },
  "SA":   { "us-east": [110, 200], "eu-west": [180, 280], "asia-east": [240, 360] },
  "AF":   { "us-east": [140, 240], "eu-west": [70, 160], "asia-east": [220, 330] },
  "ME":   { "us-east": [130, 220], "eu-west": [60, 140], "asia-east": [140, 230] },
}

// =============================================================================
// SIGNAL: LATENCY MISMATCH
// =============================================================================
//
// If the user's measured RTT to anchor regions does not match the expected RTT
// pattern for their IP-country, they're likely tunneling. Decentralized VPNs
// (Deeper/Mysterium/Anomi) inherit the residential exit's latency but route
// the user's actual TCP stack through their mesh, producing distinctive RTT
// inflation in the 20-80 ms range above the baseline.
// =============================================================================

function detectLatencyMismatch(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  if (!inputs.latencyMeasurements || inputs.latencyMeasurements.length < 2 || !inputs.ipCountry) {
    return null
  }
  const region = COUNTRY_TO_REGION[inputs.ipCountry.toUpperCase()]
  if (!region) return null

  const expectations = REGIONAL_RTT_EXPECTATIONS[region]
  if (!expectations) return null

  let mismatches = 0
  let totalMeasured = 0
  let totalOverInflation = 0

  for (const measurement of inputs.latencyMeasurements) {
    const expected = expectations[measurement.region]
    if (!expected) continue
    totalMeasured++
    const [minMs, maxMs] = expected
    if (measurement.ms < minMs * 0.6 || measurement.ms > maxMs * 1.8) {
      mismatches++
      totalOverInflation += Math.max(0, measurement.ms - maxMs)
    }
  }

  if (totalMeasured < 2 || mismatches < 2) return null

  // Strong signal: multiple anchors show inflated/inverted latency
  const mismatchRatio = mismatches / totalMeasured
  const inflationFactor = Math.min(1, totalOverInflation / 200)
  const confidence = Math.round(60 + mismatchRatio * 30 + inflationFactor * 10)

  return {
    type: "latency_mismatch",
    weight: 78,
    confidence,
    metadata: { mismatches, totalMeasured, region, totalOverInflation },
  }
}

// =============================================================================
// SIGNAL: WEBRTC MULTI-IP / mDNS HIDING
// =============================================================================
//
// Decentralized VPNs (Mysterium/Deeper) cannot prevent WebRTC from leaking the
// user's real LAN IP and STUN-discovered public IP. If WebRTC shows >1 public
// IP, or shows an IP that differs from the server-observed IP, that's a leak
// — proof the user is tunneling. Note: mDNS-obfuscated WebRTC (modern browsers
// default) returns ".local" candidates - we don't flag those as suspicious.
// =============================================================================

function detectWebRTCAnomaly(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  if (!inputs.webrtcIPs || inputs.webrtcIPs.length === 0) return null

  const publicIPs = inputs.webrtcIPs.filter((ip) => {
    if (!ip || typeof ip !== "string") return false
    if (ip.endsWith(".local")) return false // mDNS-obfuscated, not a leak
    if (/^10\./.test(ip)) return false
    if (/^192\.168\./.test(ip)) return false
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return false
    if (/^127\./.test(ip)) return false
    if (/^169\.254\./.test(ip)) return false
    if (/^fe80:/.test(ip)) return false
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) || /^[0-9a-f:]+$/i.test(ip)
  })

  if (publicIPs.length === 0) return null

  const unique = [...new Set(publicIPs)]

  // Multiple public IPs = tunneling
  if (unique.length > 1) {
    return {
      type: "webrtc_multiple_public_ips",
      weight: 88,
      confidence: 92,
      metadata: { ips: unique },
    }
  }

  // Single public IP that differs from server-seen IP = classic VPN leak
  if (unique[0] !== inputs.clientIP) {
    return {
      type: "webrtc_real_ip_leak",
      weight: 95,
      confidence: 97,
      metadata: { webrtcIP: unique[0], serverIP: inputs.clientIP },
    }
  }

  return null
}

// =============================================================================
// SIGNAL: TIMEZONE vs IP-COUNTRY MISMATCH (browser truth-bomb)
// =============================================================================
//
// VPNs route TRAFFIC but cannot change the browser's reported timezone. If the
// reported timezone region doesn't match the country resolved from the user's
// IP, they're tunneling. We use a conservative country->timezone-prefix map.
// =============================================================================

const COUNTRY_TIMEZONE_PREFIX: Record<string, string[]> = {
  US: ["America/", "Pacific/Honolulu", "Pacific/Anchorage"],
  CA: ["America/"], MX: ["America/"],
  BR: ["America/"], AR: ["America/"], CL: ["America/"], CO: ["America/"], PE: ["America/"],
  GB: ["Europe/London"], IE: ["Europe/Dublin"],
  DE: ["Europe/Berlin"], FR: ["Europe/Paris"], NL: ["Europe/Amsterdam"],
  IT: ["Europe/Rome"], ES: ["Europe/Madrid"], PT: ["Europe/Lisbon", "Atlantic/Azores"],
  CH: ["Europe/Zurich"], AT: ["Europe/Vienna"], BE: ["Europe/Brussels"],
  PL: ["Europe/Warsaw"], CZ: ["Europe/Prague"], SE: ["Europe/Stockholm"],
  NO: ["Europe/Oslo"], FI: ["Europe/Helsinki"], DK: ["Europe/Copenhagen"],
  RU: ["Europe/Moscow", "Asia/", "Europe/Kaliningrad"],
  UA: ["Europe/Kiev", "Europe/Kyiv"],
  JP: ["Asia/Tokyo"], KR: ["Asia/Seoul"],
  CN: ["Asia/Shanghai", "Asia/Hong_Kong"], TW: ["Asia/Taipei"], HK: ["Asia/Hong_Kong"],
  SG: ["Asia/Singapore"], MY: ["Asia/Kuala_Lumpur"], TH: ["Asia/Bangkok"],
  VN: ["Asia/Ho_Chi_Minh"], PH: ["Asia/Manila"], ID: ["Asia/Jakarta"],
  IN: ["Asia/Kolkata", "Asia/Calcutta"], PK: ["Asia/Karachi"], BD: ["Asia/Dhaka"],
  AU: ["Australia/"], NZ: ["Pacific/Auckland"],
  ZA: ["Africa/Johannesburg"], NG: ["Africa/Lagos"], KE: ["Africa/Nairobi"],
  EG: ["Africa/Cairo"], MA: ["Africa/Casablanca"],
  AE: ["Asia/Dubai"], SA: ["Asia/Riyadh"], IL: ["Asia/Jerusalem"], TR: ["Europe/Istanbul"],
}

function detectTimezoneCountryMismatch(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  if (!inputs.timezone || !inputs.ipCountry) return null

  const expectedPrefixes = COUNTRY_TIMEZONE_PREFIX[inputs.ipCountry.toUpperCase()]
  if (!expectedPrefixes) return null

  const matches = expectedPrefixes.some((p) =>
    p.endsWith("/") ? inputs.timezone!.startsWith(p) : inputs.timezone === p
  )

  if (matches) return null

  return {
    type: "timezone_country_mismatch",
    weight: 72,
    confidence: 88,
    metadata: { timezone: inputs.timezone, ipCountry: inputs.ipCountry },
  }
}

// =============================================================================
// SIGNAL: NAVIGATOR RTT vs CLAIMED-LOCATION ANOMALY
// =============================================================================
//
// NetworkInformation.rtt is the OS-level RTT to a nearby endpoint. On VPN it
// will reflect tunnel overhead (typically +20 to +200 ms). If the user claims
// to be in a major country (good ISP coverage) but reports >150 ms RTT with
// "4g" effective type, that's tunnel inflation - especially for Deeper/Anomi
// which add 50-150 ms overhead through the mesh.
// =============================================================================

function detectRTTAnomaly(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  if (!inputs.navigatorRTT || !inputs.ipCountry) return null
  if (!inputs.effectiveType) return null

  // Major countries with excellent ISP infrastructure
  const highInfraCountries = new Set(["US", "CA", "GB", "DE", "FR", "NL", "JP", "KR", "SG", "AU", "SE", "DK", "FI", "CH", "AT", "BE"])
  if (!highInfraCountries.has(inputs.ipCountry.toUpperCase())) return null

  // Connection type vs RTT thresholds (real-world residential baselines)
  const thresholds: Record<string, number> = {
    "4g": 160,
    "wifi": 140,
    "3g": 0, // 3g is too noisy to use
    "2g": 0,
    "slow-2g": 0,
  }
  const threshold = thresholds[inputs.effectiveType.toLowerCase()]
  if (!threshold || inputs.navigatorRTT < threshold) return null

  // RTT inflated for a high-infra country on a fast connection = tunneling
  const inflation = inputs.navigatorRTT - threshold
  const confidence = Math.min(85, 60 + inflation / 5)

  return {
    type: "navigator_rtt_anomaly",
    weight: 55,
    confidence: Math.round(confidence),
    metadata: { rtt: inputs.navigatorRTT, threshold, effectiveType: inputs.effectiveType },
  }
}

// =============================================================================
// SIGNAL: LANGUAGE / PLATFORM / TIMEZONE STACK MISMATCH
// =============================================================================
//
// Most users have a CONSISTENT linguistic and OS profile. A user with:
//   - Browser languages: ["zh-CN", "en-US"]
//   - Timezone: "Asia/Shanghai"
//   - IP geolocated to: Sweden
// ...is almost certainly on a VPN. We score the dissonance.
// =============================================================================

const LANGUAGE_TO_COUNTRIES: Record<string, string[]> = {
  "ru": ["RU", "BY", "KZ", "UA"],
  "zh": ["CN", "TW", "HK", "SG"],
  "ja": ["JP"],
  "ko": ["KR"],
  "ar": ["SA", "AE", "EG", "JO", "QA", "KW", "MA", "DZ", "TN", "IQ", "SY", "LB"],
  "hi": ["IN"],
  "th": ["TH"],
  "vi": ["VN"],
  "tr": ["TR"],
  "fa": ["IR", "AF", "TJ"],
}

function detectLanguageCountryMismatch(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  if (!inputs.languages || inputs.languages.length === 0 || !inputs.ipCountry) return null

  // Look at primary language only
  const primary = inputs.languages[0]?.split("-")[0]?.toLowerCase()
  if (!primary) return null

  const expectedCountries = LANGUAGE_TO_COUNTRIES[primary]
  if (!expectedCountries) return null // Not a strongly-region-bound language

  if (expectedCountries.includes(inputs.ipCountry.toUpperCase())) return null

  return {
    type: "language_country_mismatch",
    weight: 45,
    confidence: 70,
    metadata: { primaryLanguage: primary, ipCountry: inputs.ipCountry, expectedCountries },
  }
}

// =============================================================================
// SIGNAL: DECENTRALIZED-VPN ORG / ISP TOKENS
// =============================================================================
//
// Even when ASN lookup misses, the ISP/org name often contains a giveaway:
// "Deeper Network LLC", "Mysterium Operator", etc. We check both the raw
// ISP/org and the ASN string.
// =============================================================================

const DVPN_ORG_TOKENS = [
  "deeper network", "deeper connect",
  "mysterium", "myst node",
  "tachyon", "anomi vpn",
  "sentinel dvpn",
  "orchid protocol",
  "loki network", "lokinet",
  "session messenger",
  "i2p ",
  "tor exit", "tor relay",
  "hola network", "hola vpn",
  "honeygain",
  "packetstream",
  "earnapp", "pawns",
  "smartproxy", "bright data", "luminati", "oxylabs", "soax", "iproyal",
  "zerotier",
  "njal.la", "njalla",
  "anonymous hosting",
  "offshore hosting",
] as const

function detectDvpnOrg(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  const haystack = `${inputs.isp || ""} ${inputs.org || ""} ${inputs.asn || ""}`.toLowerCase()
  if (!haystack.trim()) return null

  for (const token of DVPN_ORG_TOKENS) {
    if (haystack.includes(token)) {
      return {
        type: "dvpn_org_token",
        weight: 95,
        confidence: 95,
        metadata: { token, haystack },
      }
    }
  }
  return null
}

// =============================================================================
// SIGNAL: HEADLESS-LIKE FINGERPRINT (hacker tooling)
// =============================================================================
//
// Real users have non-zero hardware concurrency and device memory. Many
// VPN/proxy automation setups run in containers or headless browsers and
// expose hardware fingerprints that are TOO clean.
// =============================================================================

function detectHeadlessFingerprint(inputs: ResidentialVPNInputs): BehavioralSignal | null {
  let suspicious = 0
  const reasons: string[] = []

  if (inputs.hardwareConcurrency === 0 || inputs.hardwareConcurrency === undefined) {
    suspicious++
    reasons.push("no_hardware_concurrency")
  }
  if (inputs.deviceMemory === 0) {
    suspicious++
    reasons.push("no_device_memory")
  }
  if (inputs.userAgent && /HeadlessChrome|PhantomJS|Selenium|Puppeteer|Playwright/i.test(inputs.userAgent)) {
    suspicious += 3
    reasons.push("headless_ua")
  }
  if (inputs.userAgent && inputs.platform) {
    const ua = inputs.userAgent.toLowerCase()
    const plat = inputs.platform.toLowerCase()
    if ((ua.includes("windows") && !plat.includes("win")) ||
        (ua.includes("mac") && !plat.includes("mac") && !plat.includes("darwin")) ||
        (ua.includes("android") && !plat.includes("linux") && !plat.includes("arm"))) {
      suspicious++
      reasons.push("ua_platform_mismatch")
    }
  }

  if (suspicious < 2) return null

  return {
    type: "headless_fingerprint",
    weight: 65,
    confidence: Math.min(90, 50 + suspicious * 15),
    metadata: { reasons, suspicious },
  }
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export function detectResidentialVPN(inputs: ResidentialVPNInputs): ResidentialVPNResult {
  const signals: BehavioralSignal[] = []
  const reasons: string[] = []

  const runners: Array<(i: ResidentialVPNInputs) => BehavioralSignal | null> = [
    detectLatencyMismatch,
    detectWebRTCAnomaly,
    detectTimezoneCountryMismatch,
    detectRTTAnomaly,
    detectLanguageCountryMismatch,
    detectDvpnOrg,
    detectHeadlessFingerprint,
  ]

  for (const runner of runners) {
    try {
      const result = runner(inputs)
      if (result) {
        signals.push(result)
        reasons.push(result.type)
      }
    } catch (err) {
      // Individual signal errors must never break the pipeline
      log.warn("[residential-vpn] signal error", { runner: runner.name, err })
    }
  }

  // Score: weighted average of weight*confidence, plus a "many independent
  // signals" bonus to capture residential dVPNs that show small anomalies
  // across many vectors simultaneously.
  let weighted = 0
  let totalWeight = 0
  for (const s of signals) {
    weighted += s.weight * (s.confidence / 100)
    totalWeight += s.weight
  }
  const base = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0
  const diversityBonus = Math.min(20, signals.length * 5)
  const score = Math.min(100, base + diversityBonus)

  // "Suspect" requires multiple independent behavioral signals OR one extremely
  // high-confidence signal (e.g. WebRTC real-IP leak or dvpn-org-token).
  const hasDecisiveSignal = signals.some(
    (s) =>
      (s.type === "webrtc_real_ip_leak" && s.confidence >= 90) ||
      (s.type === "dvpn_org_token" && s.confidence >= 90),
  )
  const isSuspect = hasDecisiveSignal || (signals.length >= 3 && score >= 60)

  // Confidence = composite weighted by signal count
  const confidence = Math.min(100, Math.round(score * (signals.length >= 4 ? 1.0 : 0.85)))

  return {
    score: Math.round(score),
    signals,
    isSuspect,
    confidence,
    reasons,
  }
}
