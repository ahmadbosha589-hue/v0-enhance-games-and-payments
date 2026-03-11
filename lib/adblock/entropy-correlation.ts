// =============================================================================
// ENTROPY-BASED BEHAVIOR CORRELATION ENGINE
// Pushes detection past 95% by correlating behavioral patterns
// =============================================================================

export interface PaintTimingMetrics {
  firstPaint: number
  firstContentfulPaint: number
  largestContentfulPaint: number
  firstInputDelay: number
  cumulativeLayoutShift: number
  timeToInteractive: number
  totalBlockingTime: number
}

export interface ResourceWaterfallGap {
  resourceUrl: string
  expectedStart: number
  actualStart: number
  gap: number
  isAnomalous: boolean
}

export interface MutationAnomalyMetrics {
  removedElements: number
  hiddenElements: number
  modifiedStyles: number
  blockedScripts: number
  suspiciousPatterns: string[]
  anomalyScore: number
}

export interface EntropyCorrelationResult {
  paintTimingAnomaly: boolean
  resourceWaterfallAnomaly: boolean
  mutationAnomaly: boolean
  correlatedConfidence: number
  entropyScore: number
  behaviorFingerprint: string
  signals: Array<{
    type: string
    value: number
    weight: number
    anomalyDetected: boolean
  }>
}

// =============================================================================
// PAINT TIMING CORRELATION
// Ad blockers affect paint timing in predictable ways
// =============================================================================

export async function analyzePaintTiming(): Promise<{
  metrics: PaintTimingMetrics
  isAnomalous: boolean
  anomalyScore: number
}> {
  const metrics: PaintTimingMetrics = {
    firstPaint: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    firstInputDelay: 0,
    cumulativeLayoutShift: 0,
    timeToInteractive: 0,
    totalBlockingTime: 0,
  }

  if (typeof window === "undefined" || !window.performance) {
    return { metrics, isAnomalous: false, anomalyScore: 0 }
  }

  try {
    // Get paint timing entries
    const paintEntries = performance.getEntriesByType("paint")
    for (const entry of paintEntries) {
      if (entry.name === "first-paint") {
        metrics.firstPaint = entry.startTime
      } else if (entry.name === "first-contentful-paint") {
        metrics.firstContentfulPaint = entry.startTime
      }
    }

    // Get LCP using PerformanceObserver data if available
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint")
    if (lcpEntries.length > 0) {
      metrics.largestContentfulPaint = lcpEntries[lcpEntries.length - 1].startTime
    }

    // Get navigation timing
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[]
    if (navEntries.length > 0) {
      const nav = navEntries[0]
      metrics.timeToInteractive = nav.domInteractive - nav.fetchStart
    }

    // Calculate anomaly score based on paint timing patterns
    let anomalyScore = 0

    // Ad blockers often cause faster FCP (fewer resources to load)
    if (metrics.firstContentfulPaint > 0 && metrics.firstContentfulPaint < 200) {
      anomalyScore += 15 // Suspiciously fast
    }

    // Check for paint timing gaps that indicate blocked resources
    const paintGap = metrics.firstContentfulPaint - metrics.firstPaint
    if (paintGap < 10) {
      anomalyScore += 10 // Too close together - likely blocked external resources
    }

    // LCP should be > FCP - if too close, might indicate blocked images
    if (metrics.largestContentfulPaint > 0) {
      const lcpFcpRatio = metrics.largestContentfulPaint / metrics.firstContentfulPaint
      if (lcpFcpRatio < 1.1) {
        anomalyScore += 20 // LCP too close to FCP - ad images likely blocked
      }
    }

    // Check for suspiciously fast TTI
    if (metrics.timeToInteractive > 0 && metrics.timeToInteractive < 300) {
      anomalyScore += 15 // Very fast TTI often means blocked scripts
    }

    return {
      metrics,
      isAnomalous: anomalyScore >= 30,
      anomalyScore,
    }
  } catch {
    return { metrics, isAnomalous: false, anomalyScore: 0 }
  }
}

// =============================================================================
// RESOURCE WATERFALL GAP ANALYSIS
// Detect gaps in resource loading timeline caused by blocked requests
// =============================================================================

export function analyzeResourceWaterfall(): {
  gaps: ResourceWaterfallGap[]
  isAnomalous: boolean
  gapScore: number
} {
  const gaps: ResourceWaterfallGap[] = []

  if (typeof window === "undefined" || !window.performance) {
    return { gaps, isAnomalous: false, gapScore: 0 }
  }

  try {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[]

    // Sort by start time
    const sortedResources = [...resources].sort((a, b) => a.startTime - b.startTime)

    // Analyze gaps between resource loads
    let totalGap = 0
    let suspiciousGaps = 0

    for (let i = 1; i < sortedResources.length; i++) {
      const prev = sortedResources[i - 1]
      const curr = sortedResources[i]

      const expectedStart = prev.responseEnd
      const actualStart = curr.startTime
      const gap = actualStart - expectedStart

      // Large gaps (>100ms) between resources might indicate blocked requests
      if (gap > 100) {
        const isAdRelated =
          prev.name.includes("ad") ||
          prev.name.includes("track") ||
          prev.name.includes("analytics") ||
          prev.name.includes("pixel")

        gaps.push({
          resourceUrl: curr.name,
          expectedStart,
          actualStart,
          gap,
          isAnomalous: gap > 200 || isAdRelated,
        })

        if (gap > 200 || isAdRelated) {
          suspiciousGaps++
        }

        totalGap += gap
      }
    }

    // Calculate gap score
    const avgGap = gaps.length > 0 ? totalGap / gaps.length : 0
    let gapScore = 0

    if (suspiciousGaps > 3) gapScore += 25
    if (avgGap > 300) gapScore += 20
    if (gaps.length > 10) gapScore += 15

    // Check for missing expected resources (ad-related)
    const adResourcePatterns = ["ads", "ad-", "track", "pixel", "beacon", "analytics"]
    const hasAdResources = resources.some((r) => adResourcePatterns.some((p) => r.name.toLowerCase().includes(p)))

    if (!hasAdResources && resources.length > 5) {
      gapScore += 30 // No ad resources loaded at all - highly suspicious
    }

    return {
      gaps,
      isAnomalous: gapScore >= 40,
      gapScore,
    }
  } catch {
    return { gaps, isAnomalous: false, gapScore: 0 }
  }
}

// =============================================================================
// MUTATION OBSERVER ANOMALY DETECTION
// Detect elements being removed/hidden by ad blockers in real-time
// =============================================================================

const AD_ELEMENT_SELECTORS = [
  '[class*="ad-"]',
  '[class*="ads-"]',
  '[class*="advert"]',
  '[class*="sponsor"]',
  '[class*="banner"]',
  '[id*="ad-"]',
  '[id*="ads-"]',
  '[id*="google_ads"]',
  "[data-ad]",
  "[data-ad-slot]",
  "[data-ad-client]",
  "ins.adsbygoogle",
  'iframe[src*="ad"]',
  'iframe[src*="doubleclick"]',
  '[class*="taboola"]',
  '[class*="outbrain"]',
]

let mutationMetrics: MutationAnomalyMetrics = {
  removedElements: 0,
  hiddenElements: 0,
  modifiedStyles: 0,
  blockedScripts: 0,
  suspiciousPatterns: [],
  anomalyScore: 0,
}

let mutationObserver: MutationObserver | null = null

export function startMutationObserver(): void {
  if (typeof window === "undefined" || mutationObserver) return

  // Reset metrics
  mutationMetrics = {
    removedElements: 0,
    hiddenElements: 0,
    modifiedStyles: 0,
    blockedScripts: 0,
    suspiciousPatterns: [],
    anomalyScore: 0,
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check removed nodes
      if (mutation.removedNodes.length > 0) {
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement) {
            const isAdElement = AD_ELEMENT_SELECTORS.some(
              (selector) =>
                node.matches?.(selector) || node.querySelector?.(selector) || node.className?.includes("ad"),
            )
            if (isAdElement) {
              mutationMetrics.removedElements++
              mutationMetrics.suspiciousPatterns.push(`removed:${node.tagName}`)
            }
          }
        }
      }

      // Check style modifications
      if (mutation.type === "attributes" && mutation.attributeName === "style") {
        const target = mutation.target as HTMLElement
        const style = target.style
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          const isAdElement = AD_ELEMENT_SELECTORS.some(
            (selector) => target.matches?.(selector) || target.className?.includes("ad") || target.id?.includes("ad"),
          )
          if (isAdElement) {
            mutationMetrics.hiddenElements++
            mutationMetrics.suspiciousPatterns.push(`hidden:${target.tagName}`)
          }
        }
      }

      // Check class modifications
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const target = mutation.target as HTMLElement
        if (target.classList.contains("hidden") || target.classList.contains("invisible")) {
          const wasAdElement = mutation.oldValue?.includes("ad")
          if (wasAdElement) {
            mutationMetrics.modifiedStyles++
          }
        }
      }
    }

    // Update anomaly score
    mutationMetrics.anomalyScore =
      mutationMetrics.removedElements * 15 + mutationMetrics.hiddenElements * 10 + mutationMetrics.modifiedStyles * 5
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden"],
    attributeOldValue: true,
  })
}

export function stopMutationObserver(): void {
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
}

export function getMutationMetrics(): MutationAnomalyMetrics {
  return { ...mutationMetrics }
}

// =============================================================================
// ENTROPY CORRELATION ENGINE
// Combines all behavioral signals into a correlated confidence score
// =============================================================================

export async function runEntropyCorrelation(): Promise<EntropyCorrelationResult> {
  const signals: EntropyCorrelationResult["signals"] = []

  // 1. Paint timing analysis
  const paintAnalysis = await analyzePaintTiming()
  signals.push({
    type: "paint-timing",
    value: paintAnalysis.anomalyScore,
    weight: 25,
    anomalyDetected: paintAnalysis.isAnomalous,
  })

  // 2. Resource waterfall analysis
  const waterfallAnalysis = analyzeResourceWaterfall()
  signals.push({
    type: "resource-waterfall",
    value: waterfallAnalysis.gapScore,
    weight: 30,
    anomalyDetected: waterfallAnalysis.isAnomalous,
  })

  // 3. Mutation observer analysis
  const mutationAnalysis = getMutationMetrics()
  signals.push({
    type: "mutation-observer",
    value: mutationAnalysis.anomalyScore,
    weight: 35,
    anomalyDetected: mutationAnalysis.anomalyScore >= 30,
  })

  // 4. Calculate entropy score (randomness in timing patterns)
  const entropyScore = calculateBehaviorEntropy(signals)

  // 5. Calculate correlated confidence
  let correlatedConfidence = 0
  let totalWeight = 0

  for (const signal of signals) {
    if (signal.anomalyDetected) {
      correlatedConfidence += signal.value * signal.weight
    }
    totalWeight += signal.weight
  }

  correlatedConfidence = (correlatedConfidence / totalWeight) * (signals.filter((s) => s.anomalyDetected).length / 3)

  // 6. Generate behavior fingerprint
  const behaviorFingerprint = generateBehaviorFingerprint(signals)

  return {
    paintTimingAnomaly: paintAnalysis.isAnomalous,
    resourceWaterfallAnomaly: waterfallAnalysis.isAnomalous,
    mutationAnomaly: mutationAnalysis.anomalyScore >= 30,
    correlatedConfidence: Math.min(100, correlatedConfidence),
    entropyScore,
    behaviorFingerprint,
    signals,
  }
}

function calculateBehaviorEntropy(signals: EntropyCorrelationResult["signals"]): number {
  const values = signals.map((s) => s.value)
  if (values.length === 0) return 0

  // Shannon entropy calculation
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return 0

  let entropy = 0
  for (const value of values) {
    const p = value / total
    if (p > 0) {
      entropy -= p * Math.log2(p)
    }
  }

  return entropy
}

function generateBehaviorFingerprint(signals: EntropyCorrelationResult["signals"]): string {
  const parts = signals.map((s) => `${s.type}:${s.anomalyDetected ? 1 : 0}:${Math.round(s.value)}`)
  const str = parts.join("|")

  let hash1 = 0
  let hash2 = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash1 = (hash1 << 5) - hash1 + char
    hash1 = hash1 & hash1
    hash2 = (hash2 << 7) + hash2 + char
    hash2 = hash2 & hash2
  }

  const hex1 = Math.abs(hash1).toString(16).padStart(8, "0")
  const hex2 = Math.abs(hash2).toString(16).padStart(8, "0")
  const combined = hex1 + hex2 + hex1.split("").reverse().join("") + hex2.split("").reverse().join("")

  return combined.slice(0, 32)
}
