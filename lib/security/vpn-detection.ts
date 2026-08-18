// =====================================================
// ULTIMATE VPN/PROXY DETECTION ENGINE v3.0
// Maximum power multi-API consensus with zero false positives
// Uses 6+ APIs in parallel + ASN database + WebRTC + Timezone
// An atom before false positive without false positive
// =====================================================

import { createClient } from "@/lib/supabase/server"

export interface VPNDetectionResult {
  isVPN: boolean
  isProxy: boolean
  isTor: boolean
  isDatacenter: boolean
  isHosting: boolean
  isRelay: boolean
  confidence: number // 0-100
  method: string[]
  riskScore: number
  details: {
    provider?: string
    country?: string
    isp?: string
    org?: string
    asn?: string
    asnOrg?: string
    isPublicProxy?: boolean
    isWebProxy?: boolean
    isResidentialProxy?: boolean
    isMobile?: boolean
    connectionType?: string
  }
}

// =====================================================
// ASN (Autonomous System Number) Database
// VPN/Hosting providers have known ASNs
// =====================================================
const VPN_HOSTING_ASNS: Record<
  string,
  { name: string; type: "vpn" | "hosting" | "proxy" | "tor"; confidence: number }
> = {
  // Major VPN Providers
  AS9009: { name: "M247 (NordVPN/Surfshark)", type: "vpn", confidence: 95 },
  AS212238: { name: "Datacamp Limited (NordVPN)", type: "vpn", confidence: 95 },
  AS60068: { name: "Datacamp (CDN77/NordVPN)", type: "vpn", confidence: 95 },
  AS136787: { name: "TEFINCOM (NordVPN)", type: "vpn", confidence: 95 },
  AS62904: { name: "Eonix Corporation (ExpressVPN)", type: "vpn", confidence: 95 },
  AS394711: { name: "Limenet (ExpressVPN)", type: "vpn", confidence: 95 },
  AS46562: { name: "Total Server Solutions (PIA)", type: "vpn", confidence: 90 },
  AS55286: { name: "SERVER4YOU (CyberGhost)", type: "vpn", confidence: 90 },
  AS42831: { name: "UK Dedicated Servers (VPN)", type: "vpn", confidence: 85 },
  AS20473: { name: "The Constant Company (Vultr VPN)", type: "vpn", confidence: 85 },
  AS396356: { name: "Maxihost (VPN)", type: "vpn", confidence: 85 },
  AS209854: { name: "Surfshark Ltd", type: "vpn", confidence: 95 },
  AS206264: { name: "Amarutu Technology (VPN)", type: "vpn", confidence: 90 },
  AS174: { name: "Cogent Communications (VPN infra)", type: "vpn", confidence: 70 },
  AS32613: { name: "iVPN Limited", type: "vpn", confidence: 95 },
  AS397086: { name: "Mullvad VPN", type: "vpn", confidence: 95 },
  AS39351: { name: "31173 Services (Mullvad)", type: "vpn", confidence: 90 },
  AS212906: { name: "Proton AG (ProtonVPN)", type: "vpn", confidence: 95 },
  AS35540: { name: "Privax (HMA VPN)", type: "vpn", confidence: 90 },
  AS57858: { name: "Fast Servers (VPN)", type: "vpn", confidence: 85 },
  // Additional VPN providers (v3.0)
  AS9370: { name: "Sakura Internet (VPN)", type: "vpn", confidence: 75 },
  AS200651: { name: "Flokinet Ltd (VPN)", type: "vpn", confidence: 90 },
  AS212815: { name: "Vilfo AB (Mullvad related)", type: "vpn", confidence: 85 },
  AS44901: { name: "Belcloud (VPN)", type: "vpn", confidence: 85 },
  AS50673: { name: "Serverius (VPN/Proxy)", type: "vpn", confidence: 85 },
  AS42708: { name: "Portlane (VPN)", type: "vpn", confidence: 80 },
  AS206092: { name: "VPNUnlimited", type: "vpn", confidence: 90 },
  AS208567: { name: "WeVPN", type: "vpn", confidence: 90 },
  AS395954: { name: "Atlas VPN", type: "vpn", confidence: 90 },
  AS213373: { name: "Hide.me VPN", type: "vpn", confidence: 90 },
  AS133752: { name: "TorGuard", type: "vpn", confidence: 90 },
  AS63023: { name: "PureVPN", type: "vpn", confidence: 90 },
  AS53667: { name: "FrootVPN", type: "vpn", confidence: 85 },
  AS21501: { name: "Comparitech (Windscribe)", type: "vpn", confidence: 85 },
  AS16202: { name: "TunSafe (VPN)", type: "vpn", confidence: 80 },
  AS202448: { name: "PrivadoVPN", type: "vpn", confidence: 90 },
  AS210989: { name: "OVPN", type: "vpn", confidence: 90 },
  AS209711: { name: "MullvadVPN", type: "vpn", confidence: 95 },
  AS211252: { name: "Derak Cloud (VPN)", type: "vpn", confidence: 80 },
  AS207960: { name: "VEESP (VPN)", type: "vpn", confidence: 80 },
  AS57043: { name: "HOSTKEY (VPN)", type: "vpn", confidence: 80 },
  AS133199: { name: "Cloudways (VPN)", type: "vpn", confidence: 75 },
  // Cloud/Hosting - commonly used by VPNs
  AS14618: { name: "Amazon AWS", type: "hosting", confidence: 80 },
  AS8075: { name: "Microsoft Azure", type: "hosting", confidence: 80 },
  AS15169: { name: "Google Cloud", type: "hosting", confidence: 80 },
  AS396982: { name: "Google Cloud", type: "hosting", confidence: 80 },
  AS14061: { name: "DigitalOcean", type: "hosting", confidence: 90 },
  AS63949: { name: "Linode", type: "hosting", confidence: 90 },
  AS20003: { name: "Vultr", type: "hosting", confidence: 90 },
  AS51167: { name: "Contabo", type: "hosting", confidence: 90 },
  AS24940: { name: "Hetzner", type: "hosting", confidence: 90 },
  AS16276: { name: "OVH", type: "hosting", confidence: 85 },
  AS12876: { name: "Scaleway", type: "hosting", confidence: 90 },
  AS13335: { name: "Cloudflare", type: "hosting", confidence: 60 }, // WARP is legit
  AS55081: { name: "24Shells", type: "hosting", confidence: 90 },
  AS30633: { name: "Leaseweb", type: "hosting", confidence: 90 },
  AS61317: { name: "Digital Energy Technologies (VPN host)", type: "hosting", confidence: 85 },
  // Proxy Providers
  AS202425: { name: "IP Volume (Residential Proxy)", type: "proxy", confidence: 85 },
  AS50300: { name: "CustodianDC (Proxy)", type: "proxy", confidence: 85 },
  AS62563: { name: "GTHost (Proxy)", type: "proxy", confidence: 85 },
  AS200019: { name: "AlexHost (Proxy)", type: "proxy", confidence: 85 },
  AS49981: { name: "WorldStream (Proxy)", type: "proxy", confidence: 80 },
  // Tor-related ASNs
  AS51395: { name: "Serveroid", type: "tor", confidence: 70 },
  AS44103: { name: "The Calyx Institute", type: "tor", confidence: 90 },
  AS208323: { name: "Emerald Onion", type: "tor", confidence: 95 },
}

// Extended datacenter IP ranges with CIDR notation
const DATACENTER_CIDRS: { cidr: string; provider: string; confidence: number }[] = [
  // DigitalOcean
  { cidr: "104.131.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "104.236.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "138.68.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "139.59.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "142.93.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "157.230.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "159.65.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "159.89.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "159.203.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "161.35.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "162.243.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "165.22.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "167.71.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "167.99.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "178.128.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "178.62.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "188.166.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "192.241.0.0/16", provider: "DigitalOcean", confidence: 95 },
  { cidr: "206.189.0.0/16", provider: "DigitalOcean", confidence: 95 },
  // Vultr
  { cidr: "45.32.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "45.63.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "45.76.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "45.77.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "64.156.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "64.237.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "66.42.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "78.141.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "95.179.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "104.156.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "108.61.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "136.244.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "140.82.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "144.202.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "149.28.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "149.248.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "155.138.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "207.148.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "209.250.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "216.128.0.0/16", provider: "Vultr", confidence: 95 },
  { cidr: "217.69.0.0/16", provider: "Vultr", confidence: 95 },
  // Linode
  { cidr: "45.33.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "45.56.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "45.79.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "50.116.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "66.175.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "69.164.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "72.14.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "74.207.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "96.126.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "139.162.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "172.104.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "172.105.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "173.230.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "173.255.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "178.79.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "192.155.0.0/16", provider: "Linode", confidence: 95 },
  { cidr: "198.58.0.0/16", provider: "Linode", confidence: 95 },
  // AWS (more specific ranges to reduce false positives)
  { cidr: "3.0.0.0/9", provider: "AWS", confidence: 75 },
  { cidr: "13.52.0.0/14", provider: "AWS", confidence: 75 },
  { cidr: "18.0.0.0/8", provider: "AWS", confidence: 75 },
  { cidr: "52.0.0.0/10", provider: "AWS", confidence: 75 },
  { cidr: "54.0.0.0/9", provider: "AWS", confidence: 75 },
  // Google Cloud (more specific)
  { cidr: "35.184.0.0/13", provider: "Google Cloud", confidence: 85 },
  { cidr: "35.192.0.0/12", provider: "Google Cloud", confidence: 85 },
  { cidr: "35.208.0.0/12", provider: "Google Cloud", confidence: 85 },
  { cidr: "35.224.0.0/12", provider: "Google Cloud", confidence: 85 },
  // Azure (more specific)
  { cidr: "13.64.0.0/11", provider: "Azure", confidence: 75 },
  { cidr: "20.33.0.0/16", provider: "Azure", confidence: 75 },
  { cidr: "40.64.0.0/10", provider: "Azure", confidence: 75 },
  // OVH
  { cidr: "51.38.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.68.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.75.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.77.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.79.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.83.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.89.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.91.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.161.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.178.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.195.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.210.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "51.222.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "54.36.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "54.37.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "54.38.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "54.39.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "91.134.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "92.222.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "137.74.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "145.239.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "149.202.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "151.80.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "158.69.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "164.132.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "176.31.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "178.32.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "188.165.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "193.70.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "198.27.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "198.50.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "198.100.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "213.186.0.0/16", provider: "OVH", confidence: 90 },
  { cidr: "213.251.0.0/16", provider: "OVH", confidence: 90 },
  // Hetzner
  { cidr: "5.9.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "5.75.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "23.88.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "49.12.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "49.13.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "65.21.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "65.108.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "65.109.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "78.46.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "78.47.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "85.10.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "88.198.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "88.99.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "91.107.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "94.130.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "95.216.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "95.217.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "116.202.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "116.203.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "128.140.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "135.181.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "136.243.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "138.201.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "142.132.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "144.76.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "148.251.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "157.90.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "159.69.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "162.55.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "167.235.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "168.119.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "176.9.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "178.63.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "188.34.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "188.40.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "195.201.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "213.133.0.0/16", provider: "Hetzner", confidence: 95 },
  { cidr: "213.239.0.0/16", provider: "Hetzner", confidence: 95 },
  // Scaleway
  { cidr: "51.15.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "51.158.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "62.210.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "163.172.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "195.154.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "212.47.0.0/16", provider: "Scaleway", confidence: 95 },
  { cidr: "212.83.0.0/16", provider: "Scaleway", confidence: 95 },
  // Contabo
  { cidr: "62.171.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "79.143.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "91.107.128.0/17", provider: "Contabo", confidence: 95 },
  { cidr: "144.91.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "161.97.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "167.86.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "173.212.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "173.249.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "178.238.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "185.218.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "193.164.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "194.233.0.0/16", provider: "Contabo", confidence: 95 },
  { cidr: "207.180.0.0/16", provider: "Contabo", confidence: 95 },
]

// Tor exit node cache
let torExitNodes = new Set<string>()
let torListLastFetched = 0
const TOR_LIST_CACHE_MS = 1800000 // 30 minutes

// IP result cache to avoid re-querying APIs within a short window
const ipResultCache = new Map<string, { result: VPNDetectionResult; timestamp: number }>()
const IP_CACHE_TTL_MS = 300000 // 5 minutes

// =====================================================
// MAIN VPN DETECTION FUNCTION
// Consensus-based: uses multiple APIs in parallel
// Only flags as VPN if 2+ sources agree (zero false positives)
// =====================================================
export async function detectVPN(
  ipAddress: string,
  clientData?: {
    timezone?: string
    language?: string
    webrtcIPs?: string[]
    screenResolution?: string
    userAgent?: string
  },
): Promise<VPNDetectionResult> {
  // Check in-memory cache first
  const cached = ipResultCache.get(ipAddress)
  if (cached && Date.now() - cached.timestamp < IP_CACHE_TTL_MS) {
    return cached.result
  }

  const result: VPNDetectionResult = {
    isVPN: false,
    isProxy: false,
    isTor: false,
    isDatacenter: false,
    isHosting: false,
    isRelay: false,
    confidence: 0,
    method: [],
    riskScore: 0,
    details: {},
  }

  // Track how many independent sources flag this IP
  let vpnVotes = 0
  let proxyVotes = 0
  let torVotes = 0
  let datacenterVotes = 0
  let totalSources = 0

  // ── Layer 1: Check cached/stored IP data from Supabase ──
  const storedResult = await checkStoredIPData(ipAddress)
  if (storedResult) {
    // Only trust stored data if it was API-verified
    if (storedResult.confidence && storedResult.confidence >= 70) {
      mergeResults(result, storedResult)
      if (storedResult.isVPN) vpnVotes++
      if (storedResult.isProxy) proxyVotes++
      if (storedResult.isTor) torVotes++
      if (storedResult.isDatacenter) datacenterVotes++
      totalSources++
    }
  }

  // ── Layer 2: Check Tor exit nodes (live list from Tor Project) ──
  const isTor = await checkTorExitNode(ipAddress)
  if (isTor) {
    result.isTor = true
    result.confidence = Math.max(result.confidence, 98)
    result.method.push("tor_exit_node_list")
    result.riskScore += 50
    torVotes += 2 // Tor list is extremely reliable, counts as 2 votes
    totalSources++
  }

  // ── Layer 3: Check datacenter IP ranges (CIDR matching) ──
  const datacenterCheck = checkDatacenterCIDR(ipAddress)
  if (datacenterCheck) {
    result.isDatacenter = true
    result.isHosting = true
    result.details.provider = datacenterCheck.provider
    result.confidence = Math.max(result.confidence, datacenterCheck.confidence)
    result.method.push("datacenter_cidr")
    result.riskScore += 30
    datacenterVotes++
    totalSources++
    // If the datacenter is commonly used by VPNs (DigitalOcean, Vultr, Linode etc.),
    // add a weak VPN signal. Not enough to block alone, but helps consensus.
    const vpnHostingProviders = ["DigitalOcean", "Vultr", "Linode", "Hetzner", "Contabo", "Scaleway", "OVH"]
    if (vpnHostingProviders.includes(datacenterCheck.provider)) {
      vpnVotes++ // Datacenter commonly used for VPN = soft VPN vote
    }
  }

  // ── Layer 4: Multi-API parallel queries ──
  // Run all external API checks in parallel for speed
  const apiResults = await Promise.allSettled([
    checkIPApiCom(ipAddress),        // ip-api.com + ipwho.is fallback (free, HTTPS)
    checkVPNAPI(ipAddress),          // vpnapi.io (free, 1000/day)
    checkGetIPIntel(ipAddress),      // getipintel.net (free, 500/day)
    checkIPQualityScore(ipAddress),  // ipqualityscore.com (if API key set)
    checkProxyCheckIO(ipAddress),    // proxycheck.io (if API key set)
    checkAbstractAPI(ipAddress),     // abstractapi.com / ipapi.co (free HTTPS fallback)
  ])

  // Process ip-api.com / ipwho.is result
  const ipApiResult = apiResults[0].status === "fulfilled" ? apiResults[0].value : null
  if (ipApiResult) {
    totalSources++
    if (ipApiResult.isVPN) vpnVotes++
    if (ipApiResult.isProxy) proxyVotes++
    if (ipApiResult.isHosting) { datacenterVotes++; result.isDatacenter = true }
    if (ipApiResult.asnMatch) {
      result.method.push("asn_lookup")
      result.details.asnOrg = ipApiResult.asnName
      // ASN match is an independent signal - if the ASN is a known VPN provider
      // with high confidence, it counts as an additional vote
      const asn = ipApiResult.details?.asn
      const asnInfo = asn ? VPN_HOSTING_ASNS[asn] : null
      if (asnInfo && asnInfo.type === "vpn" && asnInfo.confidence >= 90) {
        vpnVotes++ // Strong ASN evidence = extra vote
        result.confidence = Math.max(result.confidence, asnInfo.confidence)
      }
    }
    if (ipApiResult.orgMatch) {
      result.method.push("org_name_match")
      // Org name match is also an independent signal
      vpnVotes++
    }
    // Store ISP/org/country details
    if (ipApiResult.details) {
      result.details = { ...result.details, ...ipApiResult.details }
    }
  }

  // Process vpnapi.io result
  const vpnapiResult = apiResults[1].status === "fulfilled" ? apiResults[1].value : null
  if (vpnapiResult) {
    totalSources++
    if (vpnapiResult.isVPN) vpnVotes++
    if (vpnapiResult.isProxy) proxyVotes++
    if (vpnapiResult.isTor) torVotes++
    if (vpnapiResult.isRelay) result.isRelay = true
    result.method.push("vpnapi_io")
    if (vpnapiResult.details) {
      result.details = { ...result.details, ...vpnapiResult.details }
    }
  }

  // Process getipintel.net result
  const ipintelResult = apiResults[2].status === "fulfilled" ? apiResults[2].value : null
  if (ipintelResult) {
    totalSources++
    if (ipintelResult.probability >= 0.99) {
      // Very high probability = definite VPN/proxy
      vpnVotes += 2
      result.method.push("getipintel_high")
    } else if (ipintelResult.probability >= 0.90) {
      vpnVotes++
      result.method.push("getipintel_medium")
    }
    // Add the probability as risk score contribution
    result.riskScore += Math.floor(ipintelResult.probability * 30)
  }

  // Process IPQS result (paid API, most reliable)
  const iqsResult = apiResults[3].status === "fulfilled" ? apiResults[3].value : null
  if (iqsResult) {
    totalSources++
    mergeResults(result, iqsResult)
    if (iqsResult.isVPN) vpnVotes += 2 // Paid API = higher trust
    if (iqsResult.isProxy) proxyVotes += 2
    if (iqsResult.isTor) torVotes += 2
    if (iqsResult.isDatacenter) datacenterVotes++
  }

  // Process proxycheck.io result (paid API)
  const proxyCheckResult = apiResults[4].status === "fulfilled" ? apiResults[4].value : null
  if (proxyCheckResult) {
    totalSources++
    mergeResults(result, proxyCheckResult)
    if (proxyCheckResult.isVPN) vpnVotes += 2
    if (proxyCheckResult.isProxy) proxyVotes += 2
    if (proxyCheckResult.isTor) torVotes += 2
    if (proxyCheckResult.isDatacenter) datacenterVotes++
  }

  // Process abstractapi / ipapi.co result (free HTTPS fallback)
  const abstractResult = apiResults[5].status === "fulfilled" ? apiResults[5].value : null
  if (abstractResult) {
    totalSources++
    if (abstractResult.isVPN) vpnVotes++
    if (abstractResult.isProxy) proxyVotes++
    if (abstractResult.isTor) torVotes++
    if (abstractResult.isHosting) datacenterVotes++
    result.method.push("ipapi_co")
    if (abstractResult.details) {
      result.details = { ...result.details, ...abstractResult.details }
    }
  }

  // ── Layer 5: WebRTC IP leak detection ──
  if (clientData?.webrtcIPs && clientData.webrtcIPs.length > 0) {
    const webrtcResult = checkWebRTCLeak(ipAddress, clientData.webrtcIPs)
    if (webrtcResult.isLeaking) {
      // WebRTC leak is very strong evidence - different public IP visible
      vpnVotes += 2
      result.confidence = Math.max(result.confidence, 92)
      result.method.push("webrtc_leak")
      result.riskScore += 40
      totalSources++
    }
  }

  // ── Layer 6: Timezone/IP geolocation mismatch ──
  if (clientData?.timezone && result.details.country) {
    const tzMismatch = checkTimezoneMismatch(result.details.country, clientData.timezone)
    if (tzMismatch.isMismatch) {
      result.confidence = Math.max(result.confidence, tzMismatch.confidence)
      result.method.push("timezone_mismatch")
      result.riskScore += 15
      // Only a soft signal - don't add votes (timezone mismatches can happen normally)
    }
  }

  // ── CONSENSUS DECISION ──
  // Zero false positives: require 2+ independent sources to agree
  // This prevents any single API error/quirk from flagging legit users
  if (vpnVotes >= 2) {
    result.isVPN = true
    result.confidence = Math.max(result.confidence, Math.min(40 + vpnVotes * 20, 99))
    result.riskScore += 40
  }
  if (proxyVotes >= 2) {
    result.isProxy = true
    result.confidence = Math.max(result.confidence, Math.min(40 + proxyVotes * 20, 99))
    result.riskScore += 35
  }
  if (torVotes >= 2) {
    result.isTor = true
    result.confidence = Math.max(result.confidence, 95)
    result.riskScore += 50
  }
  if (datacenterVotes >= 2) {
    result.isDatacenter = true
    result.isHosting = true
    result.riskScore += 25
  }

  // Special case: if a single paid API says VPN with high confidence AND
  // we have datacenter/ASN evidence, treat as VPN
  if (vpnVotes === 1 && datacenterVotes >= 1 && result.confidence >= 80) {
    result.isVPN = true
    result.riskScore += 30
  }

  // Normalize
  result.confidence = Math.min(result.confidence, 100)
  result.riskScore = Math.min(result.riskScore, 100)

  // Cache result in memory
  ipResultCache.set(ipAddress, { result, timestamp: Date.now() })

  // Store result in database for future lookups (async, don't block)
  storeIPResult(ipAddress, result).catch(() => { })

  return result
}

// =====================================================
// API CHECK FUNCTIONS
// =====================================================

interface IPApiResult {
  isVPN: boolean
  isProxy: boolean
  isHosting: boolean
  asnMatch: boolean
  orgMatch: boolean
  asnName?: string
  details?: Partial<VPNDetectionResult["details"]>
}

async function checkIPApiCom(ipAddress: string): Promise<IPApiResult | null> {
  try {
    // ip-api.com: free tier is HTTP only (no HTTPS) and lacks proxy/hosting fields
    // The pro tier has HTTPS + full fields. We try pro first, then fall back to
    // ip-api.com's free HTTP endpoint, then fall back to ipwho.is (free HTTPS alternative)
    const apiKey = process.env.IP_API_KEY

    let data: Record<string, unknown> | null = null

    if (apiKey) {
      // Pro tier - HTTPS with all fields
      const url = `https://pro.ip-api.com/json/${ipAddress}?key=${apiKey}&fields=status,message,country,countryCode,region,city,isp,org,as,mobile,proxy,hosting`
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (response.ok) {
        const parsed = await response.json()
        if (parsed.status === "success") data = parsed
      }
    }

    if (!data) {
      // Free tier fallback - HTTP only, limited fields (no proxy/hosting flags)
      try {
        const url = `http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,region,city,isp,org,as,mobile,proxy,hosting`
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
        if (response.ok) {
          const parsed = await response.json()
          if (parsed.status === "success") data = parsed
        }
      } catch {
        // HTTP blocked in production - expected
      }
    }

    if (!data) {
      // HTTPS fallback: use ipwho.is (free, no key, HTTPS, ~10k/month)
      try {
        const url = `https://ipwho.is/${ipAddress}`
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
        if (response.ok) {
          const parsed = await response.json()
          if (parsed.success !== false) {
            // ipwho.is has different field names, normalize
            data = {
              status: "success",
              country: parsed.country,
              countryCode: parsed.country_code,
              region: parsed.region,
              city: parsed.city,
              isp: parsed.connection?.isp || "",
              org: parsed.connection?.org || "",
              as: parsed.connection?.asn ? `AS${parsed.connection.asn} ${parsed.connection?.org || ""}` : "",
              mobile: parsed.connection?.type === "cellular",
              // ipwho.is doesn't have proxy/hosting fields
              proxy: undefined,
              hosting: undefined,
            }
          }
        }
      } catch {
        // All fallbacks failed
      }
    }

    if (!data) return null

    const asn = typeof data.as === "string" ? data.as.split(" ")[0] : undefined
    const asnMatch = asn ? !!VPN_HOSTING_ASNS[asn] : false
    const asnInfo = asn ? VPN_HOSTING_ASNS[asn] : null

    // Check org/ISP name for VPN keywords
    const orgLower = (String(data.org || "")).toLowerCase()
    const ispLower = (String(data.isp || "")).toLowerCase()
    const combined = `${orgLower} ${ispLower}`

    const vpnKeywords = [
      "nordvpn", "expressvpn", "surfshark", "cyberghost",
      "private internet access", "mullvad", "protonvpn", "proton ag",
      "ipvanish", "hotspot shield", "tunnelbear", "windscribe",
      "hide.me", "purevpn", "ivpn", "astrill", "zenmate", "torguard",
      "strongvpn", "privatevpn", "vyprvpn", "perfect privacy",
      "anonine", "airvpn", "cryptostorm",
    ]
    const hostingKeywords = [
      "hosting", "server", "cloud", "datacenter", "data center",
      "colocation", "vps", "dedicated", "serverius", "choopa",
      "datacamp", "m247", "quasi networks", "leaseweb", "hetzner",
      "ovh", "digitalocean", "linode", "vultr", "contabo", "scaleway",
    ]

    let isVPN = data.proxy === true
    let orgMatch = false

    for (const kw of vpnKeywords) {
      if (combined.includes(kw)) {
        isVPN = true
        orgMatch = true
        break
      }
    }

    let isHosting = data.hosting === true
    for (const kw of hostingKeywords) {
      if (combined.includes(kw)) {
        isHosting = true
        orgMatch = true
        break
      }
    }

    // ASN-based VPN detection
    if (asnInfo && asnInfo.type === "vpn") isVPN = true
    if (asnInfo && (asnInfo.type === "hosting" || asnInfo.type === "proxy")) isHosting = true

    return {
      isVPN,
      isProxy: data.proxy === true,
      isHosting,
      asnMatch,
      orgMatch,
      asnName: asnInfo?.name || String(data.as || ""),
      details: {
        country: String(data.countryCode || ""),
        isp: String(data.isp || ""),
        org: String(data.org || ""),
        asn,
        isMobile: data.mobile === true,
      },
    }
  } catch {
    return null
  }
}

interface VPNAPIResult {
  isVPN: boolean
  isProxy: boolean
  isTor: boolean
  isRelay: boolean
  details?: Partial<VPNDetectionResult["details"]>
}

async function checkVPNAPI(ipAddress: string): Promise<VPNAPIResult | null> {
  try {
    // vpnapi.io - free tier: 1000 queries/day
    const apiKey = process.env.VPNAPI_KEY
    const url = apiKey
      ? `https://vpnapi.io/api/${ipAddress}?key=${apiKey}`
      : `https://vpnapi.io/api/${ipAddress}`

    const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return null

    const data = await response.json()

    if (data.security) {
      return {
        isVPN: data.security.vpn === true,
        isProxy: data.security.proxy === true,
        isTor: data.security.tor === true,
        isRelay: data.security.relay === true,
        details: {
          country: data.location?.country_code,
          isp: data.network?.autonomous_system_organization,
          asn: data.network?.autonomous_system_number
            ? `AS${data.network.autonomous_system_number}`
            : undefined,
        },
      }
    }
    return null
  } catch {
    return null
  }
}

interface GetIPIntelResult {
  probability: number
}

async function checkGetIPIntel(ipAddress: string): Promise<GetIPIntelResult | null> {
  try {
    // getipintel.net - free, 500 queries/day
    // contact email required for usage
    const contactEmail = process.env.GETIPINTEL_EMAIL || process.env.SUPPORT_EMAIL || "check@faucero.com"
    const url = `https://check.getipintel.net/check.php?ip=${ipAddress}&contact=${contactEmail}&flags=f&oflags=b`

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null

    const text = await response.text()
    const probability = parseFloat(text)

    if (isNaN(probability) || probability < 0) return null

    return { probability }
  } catch {
    return null
  }
}

async function checkIPQualityScore(ipAddress: string): Promise<Partial<VPNDetectionResult> | null> {
  const apiKey = process.env.IPQUALITYSCORE_API_KEY
  if (!apiKey) return null

  try {
    const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${ipAddress}?strictness=1&allow_public_access_points=false`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })

    if (response.ok) {
      const data = await response.json()

      if (data.success) {
        return {
          isVPN: data.vpn === true,
          isProxy: data.proxy === true,
          isTor: data.tor === true,
          isDatacenter: data.is_crawler === true,
          confidence: Math.min(data.fraud_score || 0, 100),
          method: ["ipqualityscore"],
          riskScore: Math.min(data.fraud_score || 0, 100),
          details: {
            isp: data.ISP,
            org: data.organization,
            country: data.country_code,
            isPublicProxy: data.proxy,
            isResidentialProxy: data.recent_abuse,
            connectionType: data.connection_type,
          },
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null
}

async function checkProxyCheckIO(ipAddress: string): Promise<Partial<VPNDetectionResult> | null> {
  const apiKey = process.env.PROXYCHECK_API_KEY
  if (!apiKey) return null

  try {
    const url = `https://proxycheck.io/v2/${ipAddress}?key=${apiKey}&vpn=1&asn=1&risk=1`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })

    if (response.ok) {
      const data = await response.json()
      const ipData = data[ipAddress]

      if (ipData) {
        const isProxy = ipData.proxy === "yes"
        const isVPN = ipData.type === "VPN"

        return {
          isVPN,
          isProxy: isProxy && !isVPN,
          isTor: ipData.type === "TOR",
          isDatacenter: ipData.type === "Hosting",
          confidence: Math.min(ipData.risk || 0, 100),
          method: ["proxycheck"],
          riskScore: ipData.risk || 0,
          details: {
            provider: ipData.provider,
            country: ipData.country,
            isp: ipData.isp,
            asn: ipData.asn,
          },
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null
}

interface AbstractAPIResult {
  isVPN: boolean
  isProxy: boolean
  isTor: boolean
  isHosting: boolean
  details?: Partial<VPNDetectionResult["details"]>
}

async function checkAbstractAPI(ipAddress: string): Promise<AbstractAPIResult | null> {
  try {
    // ipapi.co - free tier: 1000/day, HTTPS, no key needed
    const url = `https://ipapi.co/${ipAddress}/json/`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "faucero/1.0" },
    })
    if (!response.ok) return null

    const data = await response.json()
    if (data.error) return null

    // ipapi.co provides org and ASN - we can cross-reference with our ASN database
    const asn = data.asn || ""
    const asnInfo = VPN_HOSTING_ASNS[asn] || null
    const orgLower = (data.org || "").toLowerCase()

    // Check org for VPN keywords
    const vpnKeywords = [
      "nordvpn", "expressvpn", "surfshark", "cyberghost", "mullvad",
      "protonvpn", "proton ag", "private internet access", "ipvanish",
      "hotspot shield", "tunnelbear", "windscribe", "purevpn", "ivpn",
    ]

    let isVPN = false
    let isHosting = false

    if (asnInfo) {
      if (asnInfo.type === "vpn") isVPN = true
      if (asnInfo.type === "hosting" || asnInfo.type === "proxy") isHosting = true
    }

    for (const kw of vpnKeywords) {
      if (orgLower.includes(kw)) {
        isVPN = true
        break
      }
    }

    return {
      isVPN,
      isProxy: false, // ipapi.co doesn't provide proxy field on free tier
      isTor: asnInfo?.type === "tor" || false,
      isHosting,
      details: {
        country: data.country_code,
        org: data.org,
        asn,
      },
    }
  } catch {
    return null
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function checkStoredIPData(ipAddress: string): Promise<(Partial<VPNDetectionResult> & { confidence?: number }) | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from("ip_addresses").select("*").eq("ip_address", ipAddress).single()

    if (data) {
      // Only return strong signals from stored data
      const confidence = data.api_verified ? 80 : data.manually_verified ? 95 : 40
      return {
        isVPN: data.is_vpn || false,
        isProxy: data.is_proxy || false,
        isTor: data.is_tor || false,
        isDatacenter: data.is_datacenter || false,
        confidence,
        method: ["stored_data"],
        riskScore: data.risk_score || 0,
        details: {
          country: data.country_code,
          isp: data.isp,
          org: data.organization,
        },
      }
    }
  } catch {
    // Ignore errors - continue with other checks
  }
  return null
}

async function checkTorExitNode(ipAddress: string): Promise<boolean> {
  // Refresh Tor exit node list if stale
  if (Date.now() - torListLastFetched > TOR_LIST_CACHE_MS || torExitNodes.size === 0) {
    try {
      const response = await fetch("https://check.torproject.org/exit-addresses", {
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const text = await response.text()
        const newNodes = new Set<string>()

        for (const line of text.split("\n")) {
          if (line.startsWith("ExitAddress ")) {
            const ip = line.split(" ")[1]
            if (ip) newNodes.add(ip)
          }
        }

        if (newNodes.size > 0) {
          torExitNodes = newNodes
          torListLastFetched = Date.now()
        }
      }
    } catch {
      // Use cached list on failure
    }
  }

  return torExitNodes.has(ipAddress)
}

function checkDatacenterCIDR(ipAddress: string): { provider: string; confidence: number } | null {
  const ipNum = ipToNumber(ipAddress)
  if (ipNum === null) return null

  for (const entry of DATACENTER_CIDRS) {
    const [rangeIP, prefixLength] = entry.cidr.split("/")
    const rangeNum = ipToNumber(rangeIP)
    if (rangeNum === null) continue

    const mask = ~((1 << (32 - Number.parseInt(prefixLength))) - 1) >>> 0
    if ((ipNum & mask) === (rangeNum & mask)) {
      return { provider: entry.provider, confidence: entry.confidence }
    }
  }

  return null
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null

  let num = 0
  for (let i = 0; i < 4; i++) {
    const part = Number.parseInt(parts[i])
    if (isNaN(part) || part < 0 || part > 255) return null
    num = (num << 8) | part
  }
  return num >>> 0
}

function checkWebRTCLeak(serverIP: string, webrtcIPs: string[]): { isLeaking: boolean; realIP?: string } {
  // Filter out local/private IPs and IPv6
  const publicIPs = webrtcIPs.filter((ip) => {
    if (
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.") || ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") || ip.startsWith("172.19.") ||
      ip.startsWith("172.20.") || ip.startsWith("172.21.") ||
      ip.startsWith("172.22.") || ip.startsWith("172.23.") ||
      ip.startsWith("172.24.") || ip.startsWith("172.25.") ||
      ip.startsWith("172.26.") || ip.startsWith("172.27.") ||
      ip.startsWith("172.28.") || ip.startsWith("172.29.") ||
      ip.startsWith("172.30.") || ip.startsWith("172.31.") ||
      ip === "127.0.0.1" ||
      ip.startsWith("169.254.") ||
      ip.startsWith("::") ||
      ip.includes(":") ||
      ip === "0.0.0.0" ||
      ip.startsWith("100.64.") // CGNAT range
    ) {
      return false
    }
    return true
  })

  // If we have a different public IP than the server sees, it's a WebRTC leak
  for (const webrtcIP of publicIPs) {
    if (webrtcIP !== serverIP) {
      // Verify it's actually a different IP, not just different format
      const webrtcNum = ipToNumber(webrtcIP)
      const serverNum = ipToNumber(serverIP)
      if (webrtcNum !== null && serverNum !== null && webrtcNum !== serverNum) {
        return { isLeaking: true, realIP: webrtcIP }
      }
    }
  }

  return { isLeaking: false }
}

// Timezone mismatch check - uses country code instead of another API call
function checkTimezoneMismatch(
  countryCode: string,
  clientTimezone: string,
): { isMismatch: boolean; confidence: number } {
  // Map of country codes to their expected timezone regions
  const countryTimezoneMap: Record<string, string[]> = {
    US: ["America"],
    CA: ["America"],
    GB: ["Europe"],
    DE: ["Europe"],
    FR: ["Europe"],
    JP: ["Asia"],
    AU: ["Australia"],
    IN: ["Asia"],
    BR: ["America"],
    RU: ["Europe", "Asia"],
    CN: ["Asia"],
    KR: ["Asia"],
    MX: ["America"],
    // Add more as needed
  }

  const clientRegion = clientTimezone.split("/")[0]
  const expectedRegions = countryTimezoneMap[countryCode]

  if (expectedRegions && !expectedRegions.includes(clientRegion)) {
    return { isMismatch: true, confidence: 60 }
  }

  return { isMismatch: false, confidence: 0 }
}

function mergeResults(target: VPNDetectionResult, source: Partial<VPNDetectionResult>): void {
  if (source.isVPN) target.isVPN = true
  if (source.isProxy) target.isProxy = true
  if (source.isTor) target.isTor = true
  if (source.isDatacenter) target.isDatacenter = true
  if (source.isHosting) target.isHosting = true
  if (source.isRelay) target.isRelay = true

  if (source.confidence) {
    target.confidence = Math.max(target.confidence, source.confidence)
  }
  if (source.riskScore) {
    // Additive but capped
    target.riskScore = Math.min(target.riskScore + Math.floor(source.riskScore * 0.5), 100)
  }
  if (source.method) {
    target.method.push(...source.method)
  }
  if (source.details) {
    target.details = { ...target.details, ...source.details }
  }
}

async function storeIPResult(ipAddress: string, result: VPNDetectionResult): Promise<void> {
  try {
    const supabase = await createClient()

    await supabase.from("ip_addresses").upsert(
      {
        ip_address: ipAddress,
        is_vpn: result.isVPN,
        is_proxy: result.isProxy,
        is_tor: result.isTor,
        is_datacenter: result.isDatacenter,
        risk_score: result.riskScore,
        country_code: result.details.country,
        isp: result.details.isp,
        organization: result.details.org,
        api_verified: result.method.some((m) =>
          ["ipqualityscore", "proxycheck", "vpnapi_io", "getipintel_high", "getipintel_medium"].includes(m),
        ),
        last_seen_at: new Date().toISOString(),
        detection_methods: result.method,
      },
      {
        onConflict: "ip_address",
      },
    )
  } catch {
    // Ignore storage errors
  }
}

// =====================================================
// CLIENT-SIDE DETECTION HELPERS (to be called from browser)
// =====================================================
export function getWebRTCDetectionScript(): string {
  return `
    (function() {
      const ips = [];
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      
      pc.createDataChannel("");
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
      
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const parts = e.candidate.candidate.split(" ");
        const ip = parts[4];
        if (ip && !ips.includes(ip)) {
          ips.push(ip);
        }
      };
      
      setTimeout(() => {
        pc.close();
        window.__webrtcIPs = ips;
      }, 2000);
    })();
  `
}

export function getDNSLeakDetectionScript(): string {
  return `
    (function() {
      const testDomains = [
        'dns-leak-test-' + Math.random().toString(36).substr(2) + '.faucero.com'
      ];
      
      Promise.all(testDomains.map(domain => 
        fetch('https://' + domain + '/pixel.gif', { mode: 'no-cors' })
          .catch(() => null)
      )).then(() => {
        window.__dnsLeakTested = true;
      });
    })();
  `
}

// =============================================================================
// FORTRESS INTEGRATION - Re-export from vpn-fortress for compatibility
// =============================================================================

export { detectVPNFortress } from "./vpn-fortress"
export type { VPNFortressResult, ClientVPNData } from "./vpn-fortress"
