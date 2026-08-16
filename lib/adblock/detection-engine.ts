// =============================================================================
// ENTERPRISE-GRADE ADBLOCK DETECTION ENGINE v5.0 - ULTIMATE MAXIMUM POWER
// Zero False Positive Architecture - Beyond Cutting Edge Technology
// =============================================================================

export interface DetectionSignal {
  method: string
  category:
    | "bait"
    | "network"
    | "timing"
    | "behavioral"
    | "dom"
    | "fingerprint"
    | "browser"
    | "script"
    | "iframe"
    | "advanced"
    | "hardware"
    | "storage"
    | "api"
  weight: number // 0-100
  confidence: number // 0-100
  timestamp: number
  metadata?: Record<string, unknown>
  retryCount?: number
  verifiedBy?: string[]
}

export interface DetectionResult {
  isBlocking: boolean
  confidence: number
  methodCount: number
  highWeightMethodCount: number
  signals: DetectionSignal[]
  consecutiveDetections: number
  serverVerified: boolean
  baselineDeviation: number
  categories: string[]
  blockerType: string | null
  bayesianProbability: number
  anomalyScore: number
  entropyScore: number
}

export interface NetworkBaseline {
  avgLatency: number
  stdDeviation: number
  sampleCount: number
  lastUpdated: number
  p95Latency: number
  p99Latency: number
  median: number
  mad: number // Median Absolute Deviation
  iqr: number // Interquartile Range
  samples: number[]
}

export interface AdvancedMetrics {
  jitter: number
  packetLoss: number
  connectionQuality: "excellent" | "good" | "fair" | "poor"
  bandwidthEstimate: number
  rtt: number
}

// =============================================================================
// STATISTICAL ANALYSIS FUNCTIONS - ADVANCED
// =============================================================================

export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squareDiffs = values.map((v) => Math.pow(v - mean, 2))
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(avgSquareDiff)
}

export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0
  return (value - mean) / stdDev
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

export function calculateMedian(values: number[]): number {
  return calculatePercentile(values, 50)
}

export function calculateMAD(values: number[]): number {
  const median = calculateMedian(values)
  const absoluteDeviations = values.map((v) => Math.abs(v - median))
  return calculateMedian(absoluteDeviations) * 1.4826
}

export function calculateModifiedZScore(value: number, median: number, mad: number): number {
  if (mad === 0) return 0
  return (0.6745 * (value - median)) / mad
}

export function calculateIQR(values: number[]): number {
  const q1 = calculatePercentile(values, 25)
  const q3 = calculatePercentile(values, 75)
  return q3 - q1
}

export function calculateSkewness(values: number[]): number {
  if (values.length < 3) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const stdDev = calculateStandardDeviation(values)
  if (stdDev === 0) return 0
  const n = values.length
  const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 3), 0)
  return (n / ((n - 1) * (n - 2))) * sum
}

export function calculateKurtosis(values: number[]): number {
  if (values.length < 4) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const stdDev = calculateStandardDeviation(values)
  if (stdDev === 0) return 0
  const n = values.length
  const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 4), 0)
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3))
}

// Shannon Entropy for detecting randomness patterns
export function calculateEntropy(values: number[]): number {
  if (values.length === 0) return 0
  const buckets = new Map<number, number>()
  values.forEach((v) => {
    const bucket = Math.floor(v / 10) * 10
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
  })
  let entropy = 0
  const total = values.length
  buckets.forEach((count) => {
    const p = count / total
    if (p > 0) entropy -= p * Math.log2(p)
  })
  return entropy
}

// Bayesian probability update
export function bayesianUpdate(prior: number, likelihood: number, evidence: number): number {
  if (evidence === 0) return prior
  return Math.min(1, Math.max(0, (prior * likelihood) / evidence))
}

// Markov Chain probability for sequential detections
export function markovChainProbability(consecutiveDetections: number, baseProb: number): number {
  // Probability increases exponentially with consecutive detections
  return 1 - Math.pow(1 - baseProb, consecutiveDetections)
}

// Kolmogorov-Smirnov test for distribution comparison
export function ksTest(sample1: number[], sample2: number[]): number {
  if (sample1.length === 0 || sample2.length === 0) return 0
  const sorted1 = [...sample1].sort((a, b) => a - b)
  const sorted2 = [...sample2].sort((a, b) => a - b)
  const all = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b)

  let maxDiff = 0
  for (const x of all) {
    const cdf1 = sorted1.filter((v) => v <= x).length / sorted1.length
    const cdf2 = sorted2.filter((v) => v <= x).length / sorted2.length
    maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2))
  }
  return maxDiff
}

// =============================================================================
// =============================================================================

// Timing side-channel analysis for detecting blocking
export function detectTimingSideChannel(measurements: number[]): {
  isBlocking: boolean
  confidence: number
  anomalyType: string
} {
  if (measurements.length < 10) return { isBlocking: false, confidence: 0, anomalyType: "none" }

  const mean = measurements.reduce((a, b) => a + b, 0) / measurements.length
  const stdDev = calculateStandardDeviation(measurements)
  const skewness = calculateSkewness(measurements)
  const kurtosis = calculateKurtosis(measurements)
  const entropy = calculateEntropy(measurements)

  // Blocked requests typically show: very low variance, low entropy, bimodal distribution
  const lowVariance = stdDev < mean * 0.1
  const lowEntropy = entropy < 2
  const highKurtosis = kurtosis > 3 // Leptokurtic = more peaked
  const negativeSkew = skewness < -0.5

  let confidence = 0
  let anomalyType = "none"

  if (lowVariance && lowEntropy) {
    confidence += 40
    anomalyType = "uniform-blocking"
  }
  if (highKurtosis) {
    confidence += 20
    anomalyType = anomalyType === "none" ? "peaked-distribution" : anomalyType
  }
  if (negativeSkew && mean < 50) {
    confidence += 25
    anomalyType = anomalyType === "none" ? "fast-failure" : anomalyType
  }

  // Check for bimodal distribution (some blocked, some not)
  const sorted = [...measurements].sort((a, b) => a - b)
  const median = calculateMedian(measurements)
  const belowMedian = measurements.filter((m) => m < median * 0.5).length
  const aboveMedian = measurements.filter((m) => m > median * 1.5).length
  if (belowMedian > measurements.length * 0.3 && aboveMedian > measurements.length * 0.3) {
    confidence += 30
    anomalyType = "bimodal-blocking"
  }

  return {
    isBlocking: confidence >= 50,
    confidence: Math.min(100, confidence),
    anomalyType,
  }
}

// Detect JavaScript execution anomalies
export function detectExecutionAnomaly(executionTimes: number[]): boolean {
  if (executionTimes.length < 5) return false

  const mean = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
  const stdDev = calculateStandardDeviation(executionTimes)

  // Blocked scripts show near-zero or suspiciously uniform execution times
  if (mean < 1 && stdDev < 0.5) return true

  // Check for execution time clustering (blocked = clustered around 0)
  const nearZero = executionTimes.filter((t) => t < 5).length
  if (nearZero / executionTimes.length > 0.7) return true

  return false
}

// Memory pressure detection for extension fingerprinting
export function analyzeMemoryPattern(samples: { heap: number; timestamp: number }[]): {
  hasExtension: boolean
  confidence: number
} {
  if (samples.length < 5) return { hasExtension: false, confidence: 0 }

  // Extensions typically add 5-50MB of memory overhead
  const heapSizes = samples.map((s) => s.heap)
  const baseline = Math.min(...heapSizes)
  const current = heapSizes[heapSizes.length - 1]
  const delta = current - baseline

  // Suspicious memory patterns
  const hasSignificantOverhead = delta > 5 * 1024 * 1024 // > 5MB
  const hasPeriodicSpikes = detectPeriodicPattern(heapSizes)

  let confidence = 0
  if (hasSignificantOverhead) confidence += 40
  if (hasPeriodicSpikes) confidence += 35

  return {
    hasExtension: confidence >= 50,
    confidence,
  }
}

// Detect periodic patterns in data
function detectPeriodicPattern(values: number[]): boolean {
  if (values.length < 10) return false

  // Simple autocorrelation check
  for (let lag = 2; lag <= Math.min(10, values.length / 3); lag++) {
    let correlation = 0
    let count = 0
    for (let i = lag; i < values.length; i++) {
      const diff1 = values[i] - values[i - 1]
      const diff2 = values[i - lag] - values[i - lag - 1]
      if ((diff1 > 0 && diff2 > 0) || (diff1 < 0 && diff2 < 0)) {
        correlation++
      }
      count++
    }
    if (correlation / count > 0.7) return true
  }
  return false
}

// Request fingerprinting for detecting modified requests
export function analyzeRequestFingerprint(headers: Record<string, string>): {
  isModified: boolean
  confidence: number
  modifications: string[]
} {
  const modifications: string[] = []
  let confidence = 0

  // Check for missing standard headers
  const standardHeaders = [
    "accept",
    "accept-language",
    "accept-encoding",
    "user-agent",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
  ]

  for (const header of standardHeaders) {
    if (!headers[header.toLowerCase()]) {
      modifications.push(`missing:${header}`)
      confidence += 10
    }
  }

  // Check for suspicious header modifications
  if (headers["dnt"] === "1") {
    modifications.push("dnt-enabled")
    confidence += 15
  }

  if (headers["sec-gpc"] === "1") {
    modifications.push("gpc-enabled")
    confidence += 15
  }

  // Check for header stripping patterns
  const suspiciousPatterns = ["via", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"]
  for (const pattern of suspiciousPatterns) {
    if (!headers[pattern.toLowerCase()] && headers["x-stripped-headers"]?.includes(pattern)) {
      modifications.push(`stripped:${pattern}`)
      confidence += 20
    }
  }

  return {
    isModified: confidence >= 30,
    confidence: Math.min(100, confidence),
    modifications,
  }
}

// =============================================================================
// WEIGHTED CONFIDENCE CALCULATION - ENHANCED
// =============================================================================

export function calculateWeightedConfidence(signals: DetectionSignal[]): number {
  if (signals.length === 0) return 0

  const categories = new Map<string, DetectionSignal[]>()
  signals.forEach((s) => {
    const existing = categories.get(s.category) || []
    existing.push(s)
    categories.set(s.category, existing)
  })

  let totalWeight = 0
  let weightedSum = 0

  const categoryCount = categories.size
  const diversityMultiplier = 1 + (categoryCount - 1) * 0.12

  categories.forEach((categorySignals) => {
    const sorted = categorySignals.sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)
    sorted.forEach((signal, index) => {
      const diminishingFactor = Math.pow(0.35, index)
      const retryBonus = signal.retryCount && signal.retryCount > 1 ? 1.1 : 1
      const verificationBonus = signal.verifiedBy && signal.verifiedBy.length > 0 ? 1.15 : 1
      const effectiveWeight =
        signal.weight *
        diminishingFactor *
        (CATEGORY_DIVERSITY_BONUS[signal.category] || 1) *
        retryBonus *
        verificationBonus
      totalWeight += effectiveWeight
      weightedSum += signal.confidence * effectiveWeight
    })
  })

  const baseConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0
  return Math.min(100, baseConfidence * diversityMultiplier)
}

// Calculate Bayesian probability of ad blocker presence
export function calculateBayesianProbability(signals: DetectionSignal[], priorProbability = 0.3): number {
  let probability = priorProbability

  for (const signal of signals) {
    // Likelihood that we'd see this signal IF user has ad blocker
    const likelihoodIfBlocking = (signal.confidence / 100) * (signal.weight / 100)
    // Likelihood that we'd see this signal IF user does NOT have ad blocker (false positive rate)
    const falsePositiveRate = Math.max(0.01, (100 - signal.weight) / 500)
    // Update probability
    const evidence = probability * likelihoodIfBlocking + (1 - probability) * falsePositiveRate
    probability = bayesianUpdate(probability, likelihoodIfBlocking, evidence)
  }

  return probability
}

// Calculate anomaly score using isolation forest concept
export function calculateAnomalyScore(signals: DetectionSignal[], baseline: NetworkBaseline | null): number {
  if (!baseline || signals.length === 0) return 0

  const anomalyScores: number[] = []

  signals.forEach((signal) => {
    if (signal.metadata?.timing && typeof signal.metadata.timing === "number") {
      const timing = signal.metadata.timing as number
      const modifiedZ = calculateModifiedZScore(
        timing,
        baseline.median || baseline.avgLatency,
        baseline.mad || baseline.stdDeviation,
      )
      anomalyScores.push(Math.abs(modifiedZ))
    }
  })

  if (anomalyScores.length === 0) return 0
  return calculatePercentile(anomalyScores, 90)
}

// =============================================================================
// =============================================================================

export interface ThresholdConfig {
  minMethods: number
  minCategories: number
  minConfidence: number
  minConsecutive: number
  minHighWeight: number
  minBayesian: number
  requireServerVerification: boolean
  requireBaitSignal: boolean
  requireNetworkSignal: boolean
}

export const THRESHOLD_CONFIGS: Record<string, ThresholdConfig> = {
  // Standard - Strict, zero false positives (v10.0 tightened)
  standard: {
    minMethods: 4, // v10.0 - was 3
    minCategories: 3, // v10.0 - was 2 (bait + network + at least one other)
    minConfidence: 65, // v10.0 - was 50
    minConsecutive: 3, // v10.0 - was 5; relies on bait+control gate
    minHighWeight: 2, // v10.0 - was 1
    minBayesian: 0.8, // v10.0 - was 0.7
    requireServerVerification: true,
    requireBaitSignal: true, // bait is the only universally reliable proof
    requireNetworkSignal: false,
  },
  // Ultra - Maximum strictness (v10.0 tightened)
  ultra: {
    minMethods: 6, // v10.0 - was 5
    minCategories: 4, // v10.0 - was 3
    minConfidence: 78, // v10.0 - was 70
    minConsecutive: 5, // v10.0 - was 7
    minHighWeight: 3, // v10.0 - was 2
    minBayesian: 0.9, // v10.0 - was 0.85
    requireServerVerification: true,
    requireBaitSignal: true,
    requireNetworkSignal: true,
  },
  // Maximum - Absolute certainty required (v10.0 tightened)
  maximum: {
    minMethods: 8, // v10.0 - was 7
    minCategories: 5, // v10.0 - was 4
    minConfidence: 88, // v10.0 - was 80
    minConsecutive: 7, // v10.0 - was 10 (with new strict gate, 7 is enough)
    minHighWeight: 4, // v10.0 - was 3
    minBayesian: 0.97, // v10.0 - was 0.95
    requireServerVerification: true,
    requireBaitSignal: true,
    requireNetworkSignal: true,
  },
}

export function meetsThreshold(result: DetectionResult, config: ThresholdConfig): boolean {
  const uniqueCategories = new Set(result.signals.map((s) => s.category))
  const hasBaitSignal = result.signals.some((s) => s.category === "bait")
  const hasNetworkSignal = result.signals.some((s) => s.category === "network")

  return (
    result.methodCount >= config.minMethods &&
    uniqueCategories.size >= config.minCategories &&
    result.confidence >= config.minConfidence &&
    result.consecutiveDetections >= config.minConsecutive &&
    result.highWeightMethodCount >= config.minHighWeight &&
    result.bayesianProbability >= config.minBayesian &&
    (!config.requireServerVerification || result.serverVerified) &&
    (!config.requireBaitSignal || hasBaitSignal) &&
    (!config.requireNetworkSignal || hasNetworkSignal)
  )
}

// =============================================================================
// DETECTION METHOD WEIGHTS - EXPANDED
// =============================================================================

export const METHOD_WEIGHTS: Record<string, number> = {
  // === BAIT-BASED DETECTION (Most Reliable - 80-98) ===
  "bait-fetch-blocked": 95,
  "bait-image-blocked": 92,
  "bait-script-blocked": 92,
  "bait-iframe-blocked": 90,
  "bait-element-hidden": 88,
  "bait-xhr-blocked": 90,
  "bait-beacon-blocked": 85,
  "bait-websocket-blocked": 85,
  "bait-video-blocked": 88,
  "bait-audio-blocked": 82,
  "bait-prefetch-blocked": 80,
  "bait-preload-blocked": 82,
  "bait-worker-blocked": 88,

  // === NETWORK-BASED DETECTION (High Reliability - 75-98) ===
  "dns-blocking": 98,
  "request-interception": 92,
  "network-timing-anomaly": 85,
  "csp-blocking": 82,
  "cors-blocking": 78,
  "prefetch-blocking": 75,
  "preconnect-blocking": 75,
  "service-worker-intercept": 90,
  "fetch-redirect-blocked": 88,
  "websocket-blocked": 85,

  // === ADVANCED API DETECTION (High - 70-90) ===
  "performance-api-anomaly": 82,
  "resource-timing-blocked": 85,
  "navigation-timing-anomaly": 78,
  "long-task-anomaly": 72,
  "paint-timing-anomaly": 70,
  "layout-shift-anomaly": 68,
  "largest-contentful-paint": 70,
  "first-input-delay": 65,

  // === STORAGE DETECTION (Medium-High - 65-85) ===
  "indexeddb-blocked": 80,
  "localstorage-blocked": 75,
  "sessionstorage-blocked": 75,
  "cache-api-blocked": 82,
  "cookie-blocked": 78,
  "storage-quota-anomaly": 72,

  // === HARDWARE API DETECTION (Medium - 60-80) ===
  "battery-api-blocked": 70,
  "bluetooth-api-blocked": 65,
  "usb-api-blocked": 65,
  "gamepad-api-blocked": 60,
  "midi-api-blocked": 60,
  "sensor-api-blocked": 68,
  "device-memory-hidden": 65,
  "hardware-concurrency-hidden": 65,

  // === SCRIPT DETECTION (High Reliability - 75-92) ===
  "inline-script-blocked": 90,
  "external-script-blocked": 90,
  "dynamic-script-blocked": 88,
  "eval-blocked": 80,
  "function-constructor-blocked": 78,
  "module-blocked": 85,
  "worker-script-blocked": 88,

  // === IFRAME DETECTION (Medium-High - 70-88) ===
  "iframe-blocked": 85,
  "iframe-sandboxed": 78,
  "iframe-csp-blocked": 82,
  "cross-origin-iframe-blocked": 78,
  "srcdoc-iframe-blocked": 80,
  "blob-iframe-blocked": 82,

  // === DOM-BASED DETECTION (Medium - 60-80) ===
  "element-removed": 78,
  "style-injection": 75,
  "class-modification": 68,
  "attribute-stripping": 65,
  "mutation-observer-triggered": 75,
  "computed-style-hidden": 72,
  "resize-observer-triggered": 70,
  "intersection-observer-blocked": 68,
  "shadow-dom-blocked": 72,
  "custom-element-blocked": 70,

  // === TIMING/BEHAVIORAL (Medium - 55-75) ===
  "timing-pattern": 68,
  "resource-sequence": 62,
  "load-order-anomaly": 62,
  "request-coalescing": 65,
  "connection-pooling-anomaly": 60,

  // === BROWSER DETECTION (Medium - 55-78) ===
  "brave-shields": 78,
  "firefox-etp": 75,
  "safari-itp": 72,
  "edge-tracking-prevention": 68,
  "opera-adblocker": 70,
  "vivaldi-blocker": 68,
  "tor-browser": 80,
  "duckduckgo-browser": 75,

  // === FINGERPRINT DETECTION (Lower - 45-70) ===
  "browser-fingerprint": 55,
  "extension-detection": 65,
  "canvas-farbling": 70,
  "webrtc-blocking": 68,
  "audio-fingerprint-blocked": 62,
  "webgl-fingerprint-blocked": 60,
  "font-enumeration-blocked": 58,
  "plugin-enumeration-blocked": 55,
  "screen-resolution-hidden": 50,
  "timezone-hidden": 52,
  "language-hidden": 48,
  "do-not-track": 45,
}

// =============================================================================
// CATEGORY DIVERSITY BONUSES
// =============================================================================

export const CATEGORY_DIVERSITY_BONUS: Record<string, number> = {
  bait: 1.25,
  network: 1.2,
  advanced: 1.15,
  api: 1.12,
  script: 1.1,
  storage: 1.08,
  iframe: 1.05,
  hardware: 1.02,
  dom: 1.0,
  timing: 0.95,
  behavioral: 0.9,
  browser: 0.85,
  fingerprint: 0.7,
}

// =============================================================================
// KNOWN AD BLOCKER SIGNATURES - COMPREHENSIVE
// =============================================================================

export const KNOWN_BLOCKERS = {
  extensions: [
    { name: "uBlock Origin", signatures: ["uBO", "uBlock", "ublock-origin", "__ublock", "uBlockOrigin"] },
    { name: "AdBlock Plus", signatures: ["ABP", "adblockplus", "__adblockplus", "adblock_plus"] },
    { name: "AdBlock", signatures: ["adblock", "getadblock", "__adblock"] },
    { name: "AdGuard", signatures: ["adguard", "__adg", "AG_onLoad", "AG_abortInlineScript", "AdguardAPI"] },
    { name: "Ghostery", signatures: ["ghostery", "__ghostery", "ghostery-purple-box", "Ghostery"] },
    { name: "Privacy Badger", signatures: ["privacyBadger", "privacybadger", "__pb"] },
    { name: "Disconnect", signatures: ["disconnect", "__disconnect", "Disconnect"] },
    { name: "NoScript", signatures: ["noscript", "__noscript", "NoScript"] },
    { name: "uMatrix", signatures: ["uMatrix", "__uMatrix"] },
    { name: "Nano Defender", signatures: ["nano", "nanoDefender", "NanoDefender"] },
    { name: "ClearURLs", signatures: ["clearurls", "ClearURLs"] },
    { name: "Decentraleyes", signatures: ["decentraleyes", "Decentraleyes"] },
    { name: "LocalCDN", signatures: ["localcdn", "LocalCDN"] },
    { name: "HTTPS Everywhere", signatures: ["https-everywhere", "HTTPSEverywhere"] },
    { name: "DuckDuckGo Privacy", signatures: ["duckduckgo", "ddg", "DDG"] },
    { name: "Blur", signatures: ["blur", "donottrackme", "Blur"] },
    { name: "TrackerControl", signatures: ["trackercontrol", "TrackerControl"] },
    { name: "Fair AdBlocker", signatures: ["fairadblock", "FairAdBlocker"] },
    { name: "Stands Fair Adblocker", signatures: ["standsfair", "StandsFair"] },
    { name: "AdNauseam", signatures: ["adnauseam", "AdNauseam"] },
    { name: "Poper Blocker", signatures: ["poperblocker", "PoperBlocker"] },
    { name: "Pop up blocker", signatures: ["popupblocker", "PopUpBlocker"] },
    { name: "Windscribe", signatures: ["windscribe", "Windscribe"] },
    { name: "Hola Ad Blocker", signatures: ["hola", "HolaAdBlocker"] },
    { name: "AdLock", signatures: ["adlock", "AdLock"] },
    { name: "Total Adblock", signatures: ["totaladblock", "TotalAdblock"] },
    { name: "Adblocker Ultimate", signatures: ["adblockerultimate", "AdblockerUltimate"] },
    { name: "Ka-Block!", signatures: ["kablock", "Ka-Block"] },
    // v12.0 NEW: less-common but real blockers seen in 2024-2026
    { name: "AdBlocker Genesis", signatures: ["adblockergenesis", "AdBlockerGenesis"] },
    { name: "Trustnav AdBlocker", signatures: ["trustnav", "TrustnavAdBlocker"] },
    { name: "Super Adblocker", signatures: ["superadblocker", "SuperAdblocker"] },
    { name: "Hyperblock", signatures: ["hyperblock", "Hyperblock"] },
    { name: "Stop All Ads", signatures: ["stopallads", "StopAllAds"] },
    { name: "Easy Ad Blocker", signatures: ["easyadblocker", "EasyAdBlocker"] },
    { name: "uBlock", signatures: ["ublock-extension"] }, // pre-uBO fork
    { name: "AdBlock Master", signatures: ["adblockmaster"] },
    { name: "AdGuard MV3", signatures: ["adguard-mv3", "adguard_mv3"] },
    { name: "uBlock Origin Lite", signatures: ["ubol", "uBOLite", "ublock-lite"] }, // MV3 variant
    { name: "uBlock Origin Dev", signatures: ["ubo-dev", "uBO-dev"] },
    { name: "AdBlocker for YouTube", signatures: ["adblockyoutube", "AdBlockerForYouTube"] },
    { name: "AdBlocker for Chrome", signatures: ["adblockforchrome", "AdBlockerForChrome"] },
    { name: "Aloha Ad Blocker", signatures: ["aloha-adblock", "AlohaAdBlocker"] },
    { name: "Magic Lasso AdBlock", signatures: ["magic-lasso", "magiclasso", "MagicLasso"] },
    { name: "Vinegar (YouTube)", signatures: ["vinegar-yt", "Vinegar"] },
    { name: "uMatrix", signatures: ["uMatrix", "umatrix"] },
    { name: "AdBlock Browser", signatures: ["adblockbrowser", "AdBlockBrowser"] },
    { name: "AdBlock Pro", signatures: ["adblockpro", "AdBlockPro"] },
    { name: "AdBlock for Firefox", signatures: ["adblockfirefox", "ABFox"] },
    { name: "Mercury AdBlock", signatures: ["mercury-adblock", "MercuryAdBlock"] },
    { name: "PowerBlocker", signatures: ["powerblocker", "PowerBlocker"] },
    { name: "Adblock Suite", signatures: ["adblock-suite", "AdblockSuite"] },
    { name: "AdRemover", signatures: ["adremover", "AdRemover"] },
    { name: "BehindTheOverlay", signatures: ["behindtheoverlay", "BTO"] },
    { name: "AdBlocker Stands", signatures: ["adblockerstands", "AdBlockerStands"] },
    { name: "Privacy Possum", signatures: ["privacypossum", "PrivacyPossum"] },
    { name: "Cookie AutoDelete", signatures: ["cookie-autodelete", "CookieAutoDelete"] },
    { name: "Don't Care About Cookies", signatures: ["dont-care-about-cookies", "IDCAC"] },
    { name: "I Don't Care About Cookies", signatures: ["i-dont-care-about-cookies", "IDCAC"] },
    { name: "Consent-O-Matic", signatures: ["consent-o-matic", "ConsentOMatic"] },
    { name: "uMute", signatures: ["umute"] },
    { name: "Rebox", signatures: ["rebox", "Rebox"] },
  ],

  dns: [
    { name: "Pi-hole", domains: ["pi.hole", "pi-hole.net"] },
    { name: "AdGuard Home", domains: ["adguard.com", "adguard-dns.com"] },
    { name: "NextDNS", domains: ["nextdns.io"] },
    { name: "Cloudflare Gateway", domains: ["cloudflare-gateway.com"] },
    { name: "Cloudflare for Families", domains: ["1.1.1.2", "1.1.1.3", "families.cloudflare-dns.com"] },
    { name: "Control D", domains: ["controld.com"] },
    { name: "Quad9", domains: ["quad9.net"] },
    { name: "Quad9 Secure", domains: ["dns.quad9.net"] },
    { name: "CleanBrowsing", domains: ["cleanbrowsing.org"] },
    { name: "OpenDNS", domains: ["opendns.com"] },
    { name: "OpenDNS FamilyShield", domains: ["familyshield.opendns.com"] },
    { name: "Adhole", domains: ["adhole.org"] },
    { name: "Technitium", domains: ["technitium.com"] },
    { name: "Blocky", domains: ["github.com/0xERR0R/blocky"] },
    { name: "dnscrypt-proxy", domains: ["dnscrypt.info"] },
    // v12.0 NEW
    { name: "Mullvad DNS", domains: ["dns.mullvad.net", "adblock.dns.mullvad.net", "base.dns.mullvad.net"] },
    { name: "DNS0.eu", domains: ["dns0.eu", "zero.dns0.eu", "kids.dns0.eu"] },
    { name: "LibreDNS", domains: ["libredns.gr"] },
    { name: "AhaDNS", domains: ["ahadns.com"] },
    { name: "Comss.one", domains: ["comss.one"] },
    { name: "Surfshark DNS", domains: ["surfshark.com/dns"] },
    { name: "NordVPN CyberSec DNS", domains: ["nord-dns.com"] },
    { name: "Yandex.DNS Safe", domains: ["dns.yandex.ru"] },
    { name: "RethinkDNS", domains: ["rethinkdns.com", "sky.rethinkdns.com"] },
    { name: "AhaDNS Blitz", domains: ["blitz.ahadns.com"] },
    { name: "FoolDNS", domains: ["fooldns.com"] },
    { name: "Personal DNS Filter", domains: ["personaldnsfilter.com"] },
    { name: "Diversion (Asus router)", domains: ["diversion.ch"] },
    { name: "TrkrPunisher", domains: ["trkrpunisher.com"] },
  ],

  browsers: [
    { name: "Brave Shields", ua: "Brave", feature: "brave" },
    { name: "Firefox ETP", ua: "Firefox", feature: "firefox" },
    { name: "Safari ITP", ua: "Safari", feature: "safari" },
    { name: "Edge Tracking Prevention", ua: "Edg", feature: "edge" },
    { name: "Opera Ad Blocker", ua: "OPR", feature: "opera" },
    { name: "Vivaldi Blocker", ua: "Vivaldi", feature: "vivaldi" },
    { name: "Samsung Internet", ua: "SamsungBrowser", feature: "samsung" },
    { name: "UC Browser", ua: "UCBrowser", feature: "ucbrowser" },
    { name: "Tor Browser", ua: "Tor", feature: "tor" },
    { name: "DuckDuckGo Browser", ua: "DuckDuckGo", feature: "ddg" },
    { name: "Waterfox", ua: "Waterfox", feature: "waterfox" },
    { name: "LibreWolf", ua: "LibreWolf", feature: "librewolf" },
    { name: "Bromite", ua: "Bromite", feature: "bromite" },
    { name: "Kiwi Browser", ua: "Kiwi", feature: "kiwi" },
  ],

  mobile: [
    { name: "AdGuard iOS", platform: "ios" },
    { name: "AdGuard Android", platform: "android" },
    { name: "Blokada", platform: "android" },
    { name: "DNS66", platform: "android" },
    { name: "AdAway", platform: "android" },
    { name: "1Blocker", platform: "ios" },
    { name: "Wipr", platform: "ios" },
    { name: "Ka-Block!", platform: "ios" },
    { name: "Firefox Focus", platform: "mobile" },
    { name: "Brave Mobile", platform: "mobile" },
    { name: "Samsung Ad Blocker", platform: "android" },
    { name: "NetGuard", platform: "android" },
    { name: "RethinkDNS", platform: "android" },
    { name: "Nebulo", platform: "android" },
    { name: "personalDNSfilter", platform: "android" },
  ],

  vpn: [
    { name: "NordVPN CyberSec" },
    { name: "Surfshark CleanWeb" },
    { name: "ExpressVPN Threat Manager" },
    { name: "ProtonVPN NetShield" },
    { name: "Windscribe R.O.B.E.R.T." },
    { name: "Private Internet Access MACE" },
    { name: "Mullvad DNS Blocking" },
    { name: "CyberGhost Ad Blocker" },
    { name: "IPVanish" },
    { name: "VyprVPN" },
    { name: "Atlas VPN" },
    { name: "AdGuard VPN" },
  ],

  network: [
    { name: "pfSense pfBlockerNG" },
    { name: "OPNsense" },
    { name: "Untangle" },
    { name: "Sophos UTM" },
    { name: "Fortinet FortiGate" },
    { name: "Cisco Umbrella" },
    { name: "Zscaler" },
    { name: "ASUS AiProtection" },
    { name: "Netgear Armor" },
    { name: "eero Secure" },
    { name: "Firewalla" },
    { name: "Circle" },
  ],
}

// =============================================================================
// BAIT URL PATTERNS - MAXIMUM COVERAGE
// =============================================================================

export const BAIT_PATTERNS = {
  google: [
    "/api/ads/ad-banner.js",
    "/api/ads/sponsored.js",
    "/api/ads/analytics.js",
    "/api/ads/doubleclick.js",
    "/api/pagead/show_ads.js",
    "/api/ads/adsense-loader.js",
    "/api/ads/gpt.js",
    "/pagead/js/adsbygoogle.js",
    "/pagead/show_ads.js",
    "/api/ads/googlesyndication.js",
    "/api/ads/googletagservices.js",
    "/api/ads/googletagmanager.js",
    "/api/ads/google-analytics.js",
    "/api/ads/ga.js",
    "/api/ads/gtag.js",
  ],

  networks: [
    "/api/ads/prebid.js",
    "/api/ads/amazon-adsystem.js",
    "/api/ads/taboola.js",
    "/api/ads/outbrain.js",
    "/api/ads/criteo.js",
    "/api/ads/media.net.js",
    "/api/ads/revcontent.js",
    "/api/ads/mgid.js",
    "/api/ads/zergnet.js",
    "/api/ads/sharethrough.js",
    "/api/ads/triplelift.js",
    "/api/ads/rubicon.js",
    "/api/ads/pubmatic.js",
    "/api/ads/appnexus.js",
    "/api/ads/openx.js",
    "/api/ads/sovrn.js",
    "/api/ads/index-exchange.js",
    "/api/ads/teads.js",
    "/api/ads/spotxchange.js",
    "/api/ads/33across.js",
    "/api/ads/gumgum.js",
    "/api/ads/nativo.js",
    "/api/ads/connatix.js",
    "/api/ads/kargo.js",
    "/api/ads/yieldmo.js",
    "/api/ads/adroll.js",
    "/api/ads/perfect-audience.js",
    "/api/ads/retargeter.js",
    "/api/ads/adform.js",
    "/api/ads/smartadserver.js",
    "/api/ads/sizmek.js",
    "/api/ads/flashtalking.js",
  ],

  video: [
    "/api/ads/ima3.js",
    "/api/ads/vast.js",
    "/api/ads/vpaid.js",
    "/api/ads/video-ad.js",
    "/api/ads/preroll.js",
    "/api/ads/midroll.js",
    "/api/ads/postroll.js",
    "/api/ads/jwplayer-ads.js",
    "/api/ads/videojs-ads.js",
    "/api/ads/freewheel.js",
    "/api/ads/springserve.js",
    "/api/ads/spotx.js",
    "/api/ads/telaria.js",
  ],

  tracking: [
    "/api/ads/tracking-pixel.gif",
    "/api/ads/beacon.gif",
    "/api/ads/pixel.gif",
    "/api/ads/moat.js",
    "/api/ads/quantcast.js",
    "/api/ads/comscore.js",
    "/api/ads/nielsen.js",
    "/api/ads/chartbeat.js",
    "/api/ads/parsely.js",
    "/api/ads/hotjar.js",
    "/api/ads/heap.js",
    "/api/ads/mixpanel.js",
    "/api/ads/amplitude.js",
    "/api/ads/segment.js",
    "/api/ads/fullstory.js",
    "/api/ads/logrocket.js",
    "/api/ads/crazyegg.js",
    "/api/ads/mouseflow.js",
    "/api/ads/lucky-orange.js",
    "/api/ads/clarity.js",
  ],

  social: [
    "/api/ads/facebook-pixel.js",
    "/api/ads/fb-events.js",
    "/api/ads/twitter-pixel.js",
    "/api/ads/linkedin-insight.js",
    "/api/ads/pinterest-tag.js",
    "/api/ads/snapchat-pixel.js",
    "/api/ads/tiktok-pixel.js",
    "/api/ads/reddit-pixel.js",
  ],

  images: [
    "/api/ads/banner.gif",
    "/api/ads/sponsor.png",
    "/api/ads/ad-300x250.gif",
    "/ads/banner.gif",
    "/ads/sponsor.png",
    "/advertisement/ad.jpg",
    "/banners/ad-300x250.png",
    "/banners/ad-728x90.gif",
    "/banners/ad-160x600.png",
    "/banners/ad-320x50.png",
    "/banners/ad-970x250.png",
    "/banners/ad-300x600.png",
    "/banners/ad-120x600.png",
    "/banners/ad-468x60.gif",
    "/banners/ad-234x60.gif",
  ],

  native: [
    "/api/ads/native-ad.js",
    "/api/ads/content-recommendation.js",
    "/api/ads/sponsored-content.js",
    "/api/ads/promoted-post.js",
    "/api/ads/in-feed-ad.js",
    "/api/ads/in-article-ad.js",
  ],

  // v12.0 NEW: Adult / popunder / push-notification ad networks (heavily blocked
  // by all major lists — EasyList, EasyPrivacy, AdGuard Base, uBO Filters)
  popunder: [
    "/api/ads/adsterra.js",
    "/api/ads/propellerads.js",
    "/api/ads/propeller-ads.js",
    "/api/ads/popads.js",
    "/api/ads/popcash.js",
    "/api/ads/hilltopads.js",
    "/api/ads/clickadu.js",
    "/api/ads/clickaine.js",
    "/api/ads/exoclick.js",
    "/api/ads/exoclick-banner.js",
    "/api/ads/trafficjunky.js",
    "/api/ads/trafficstars.js",
    "/api/ads/juicyads.js",
    "/api/ads/eroadvertising.js",
    "/api/ads/plugrush.js",
    "/api/ads/adcash.js",
    "/api/ads/adnium.js",
    "/api/ads/admaven.js",
    "/api/ads/galaksion.js",
    "/api/ads/yllix.js",
    "/api/ads/revenuehits.js",
    "/api/ads/mellowads.js",
  ],

  // v12.0 NEW: Crypto / mining / faucet ad networks
  crypto: [
    "/api/ads/coinhive.js",
    "/api/ads/coin-hive.js",
    "/api/ads/cryptoloot.js",
    "/api/ads/jsecoin.js",
    "/api/ads/webminer.js",
    "/api/ads/minero.js",
    "/api/ads/coinimp.js",
    "/api/ads/cryptotabbrowser.js",
    "/api/ads/cointraffic.js",
    "/api/ads/coinad.js",
    "/api/ads/cryptoads.js",
  ],

  // v12.0 NEW: CDN / 3rd-party domains that filter lists block by hostname
  cdn: [
    "/api/ads/cdn/static.doubleclick.net.js",
    "/api/ads/cdn/pagead2.googlesyndication.com.js",
    "/api/ads/cdn/securepubads.g.doubleclick.net.js",
    "/api/ads/cdn/adservice.google.com.js",
    "/api/ads/cdn/connect.facebook.net.js",
    "/api/ads/cdn/static.ads-twitter.com.js",
    "/api/ads/cdn/analytics.tiktok.com.js",
    "/api/ads/cdn/static.criteo.net.js",
    "/api/ads/cdn/cdn.taboola.com.js",
    "/api/ads/cdn/widgets.outbrain.com.js",
  ],

  // v12.0 NEW: Filter-list "scriptlet" hooks (uBO/AdGuard inject these names
  // when they substitute decoy implementations into ad scripts)
  scriptlet: [
    "/api/ads/scriptlet/adsbygoogle.js",
    "/api/ads/scriptlet/google-tag-manager.js",
    "/api/ads/scriptlet/google-analytics.js",
    "/api/ads/scriptlet/gtm.js",
    "/api/ads/scriptlet/adsense.js",
    "/api/ads/scriptlet/_gaq.js",
    "/api/ads/scriptlet/ga.js",
    "/api/ads/scriptlet/__google_ad__.js",
  ],
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function generateDetectionSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  const random2 = Math.random().toString(36).substring(2, 6)
  const random3 = crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
  return `det_${timestamp}_${random}_${random2}_${random3}`
}

export function generateChecksum(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export function verifyChecksum(data: string, checksum: string): boolean {
  return generateChecksum(data) === checksum
}

export function getAllBaitUrls(): string[] {
  return [
    ...BAIT_PATTERNS.google,
    ...BAIT_PATTERNS.networks,
    ...BAIT_PATTERNS.video,
    ...BAIT_PATTERNS.tracking,
    ...BAIT_PATTERNS.social,
    ...BAIT_PATTERNS.images,
    ...BAIT_PATTERNS.native,
    // v12.0: include the new bait categories so the rotating-route picker
    // and entropy-correlation engine probe a much wider footprint.
    ...BAIT_PATTERNS.popunder,
    ...BAIT_PATTERNS.crypto,
    ...BAIT_PATTERNS.cdn,
    ...BAIT_PATTERNS.scriptlet,
  ]
}

export function detectBrowserType(): { name: string; isPrivacyBrowser: boolean; version: string } {
  const ua = navigator.userAgent
  let version = ""

  const versionMatch = ua.match(/(Chrome|Firefox|Safari|Edge|OPR|Brave|Vivaldi)\/(\d+)/)
  if (versionMatch) version = versionMatch[2]

  if ((navigator as any).brave) return { name: "Brave", isPrivacyBrowser: true, version }
  if (ua.includes("LibreWolf")) return { name: "LibreWolf", isPrivacyBrowser: true, version }
  if (ua.includes("Waterfox")) return { name: "Waterfox", isPrivacyBrowser: true, version }
  if (ua.includes("Firefox")) return { name: "Firefox", isPrivacyBrowser: true, version }
  if (ua.includes("Safari") && !ua.includes("Chrome")) return { name: "Safari", isPrivacyBrowser: true, version }
  if (ua.includes("Edg")) return { name: "Edge", isPrivacyBrowser: false, version }
  if (ua.includes("OPR") || ua.includes("Opera")) return { name: "Opera", isPrivacyBrowser: false, version }
  if (ua.includes("Vivaldi")) return { name: "Vivaldi", isPrivacyBrowser: true, version }
  if (ua.includes("Chrome")) return { name: "Chrome", isPrivacyBrowser: false, version }

  return { name: "Unknown", isPrivacyBrowser: false, version: "" }
}

export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function getPlatformType(): "ios" | "android" | "desktop" | "unknown" {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return "ios"
  if (/Android/.test(ua)) return "android"
  if (/Win|Mac|Linux/.test(ua)) return "desktop"
  return "unknown"
}

export function getConnectionType(): string {
  const conn = (navigator as any).connection
  if (!conn) return "unknown"
  return conn.effectiveType || conn.type || "unknown"
}

export function getDeviceMemory(): number {
  return (navigator as any).deviceMemory || 0
}

export function getHardwareConcurrency(): number {
  return navigator.hardwareConcurrency || 0
}
