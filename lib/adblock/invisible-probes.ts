// =============================================================================
// HUMAN-INVISIBLE PROBES
// Detection requests that never touch DOM or visible JS state
// =============================================================================

// Probe results stored in WeakMap to avoid enumeration
const probeResults = new WeakMap<object, boolean>()
const probeKey = {}

// =============================================================================
// 1. SENDBEACON PROBE - Fire and forget, no response needed
// =============================================================================

export async function runBeaconProbe(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false
  }

  try {
    // Use sendBeacon - it's designed to be fire-and-forget
    // Ad blockers typically block these to ad endpoints
    const probeUrls = ["/api/ads/beacon-probe", "/api/track/collect", "/api/pixel/event", "/api/analytics/log"]

    let blockedCount = 0

    for (const url of probeUrls) {
      const blob = new Blob([JSON.stringify({ t: Date.now() })], { type: "application/json" })
      const sent = navigator.sendBeacon(url, blob)

      if (!sent) {
        blockedCount++
      }
    }

    return blockedCount >= 3 // At least 3 blocked = likely ad blocker (stricter)
  } catch {
    return false
  }
}

// =============================================================================
// 2. LINK PREFETCH PROBE - Uses browser's prefetch mechanism
// =============================================================================

export async function runPrefetchProbe(): Promise<boolean> {
  if (typeof document === "undefined") {
    return false
  }

  return new Promise((resolve) => {
    try {
      const prefetchUrls = ["/api/ads/prefetch-target.js", "/api/ads/dns-prefetch.js", "/api/track/preconnect.js"]

      let blockedCount = 0
      let completedCount = 0

      for (const url of prefetchUrls) {
        const link = document.createElement("link")
        link.rel = "prefetch"
        link.href = url
        link.as = "script"

        // These events fire even if blocked, but we can detect via Resource Timing API
        link.onload = () => {
          completedCount++
          checkComplete()
        }
        link.onerror = () => {
          blockedCount++
          checkComplete()
        }

        // Insert invisibly
        document.head.appendChild(link)

        // Clean up after a short delay
        setTimeout(() => {
          link.remove()
        }, 100)
      }

      function checkComplete() {
        if (completedCount + blockedCount >= prefetchUrls.length) {
          // Require ALL to be blocked for detection (stricter)
          resolve(blockedCount >= prefetchUrls.length)
        }
      }

      // Timeout fallback - don't assume blocking on timeout
      setTimeout(() => {
        resolve(blockedCount >= 2)
      }, 3000)
    } catch {
      resolve(false)
    }
  })
}

// =============================================================================
// 3. CSS BACKGROUND PROBE - Uses CSS to trigger requests
// =============================================================================

export async function runCssBackgroundProbe(): Promise<boolean> {
  if (typeof document === "undefined") {
    return false
  }

  return new Promise((resolve) => {
    try {
      // Create a style element with background images pointing to ad URLs
      const style = document.createElement("style")
      style.textContent = `
        .adblock-probe-1 { background-image: url('/api/ads/css-probe-1.gif'); }
        .adblock-probe-2 { background-image: url('/api/track/css-probe-2.gif'); }
        .adblock-probe-3 { background-image: url('/api/pixel/css-probe-3.gif'); }
      `

      // Insert style
      document.head.appendChild(style)

      // Create invisible elements that use these classes
      const probeContainer = document.createElement("div")
      probeContainer.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;"

      const probe1 = document.createElement("div")
      probe1.className = "adblock-probe-1"
      const probe2 = document.createElement("div")
      probe2.className = "adblock-probe-2"
      const probe3 = document.createElement("div")
      probe3.className = "adblock-probe-3"

      probeContainer.appendChild(probe1)
      probeContainer.appendChild(probe2)
      probeContainer.appendChild(probe3)
      document.body.appendChild(probeContainer)

      // Wait for potential requests
      setTimeout(() => {
        // Check Resource Timing API for the requests
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[]
        const probeUrls = ["css-probe-1.gif", "css-probe-2.gif", "css-probe-3.gif"]

        let loadedCount = 0
        for (const url of probeUrls) {
          if (resources.some((r) => r.name.includes(url))) {
            loadedCount++
          }
        }

        // Clean up
        style.remove()
        probeContainer.remove()

        // If NONE loaded, likely blocked (stricter - was < 2)
        resolve(loadedCount === 0)
      }, 2000)
    } catch {
      resolve(false)
    }
  })
}

// =============================================================================
// 4. WORKER PROBE - Uses Web Worker to make requests
// =============================================================================

export async function runWorkerProbe(): Promise<boolean> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined") {
    return false
  }

  return new Promise((resolve) => {
    try {
      // Create a worker that makes fetch requests
      const workerCode = `
        self.onmessage = async function(e) {
          const urls = e.data.urls;
          const results = [];
          
          for (const url of urls) {
            try {
              const response = await fetch(url, { mode: 'no-cors' });
              results.push({ url, blocked: false });
            } catch {
              results.push({ url, blocked: true });
            }
          }
          
          self.postMessage(results);
        };
      `

      const blob = new Blob([workerCode], { type: "application/javascript" })
      const workerUrl = URL.createObjectURL(blob)
      const worker = new Worker(workerUrl)

      const probeUrls = [
        "/api/ads/worker-probe-1.js",
        "/api/track/worker-probe-2.js",
        "/api/pixel/worker-probe-3.js",
        "/api/ads/worker-probe-4.js",
      ]

      worker.onmessage = (e) => {
        const results = e.data as Array<{ url: string; blocked: boolean }>
        const blockedCount = results.filter((r) => r.blocked).length

        // Clean up
        worker.terminate()
        URL.revokeObjectURL(workerUrl)

        // Require more blocked for detection to reduce FP
        resolve(blockedCount >= 3)
      }

      worker.onerror = () => {
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
        resolve(false)
      }

      worker.postMessage({ urls: probeUrls })

      // Timeout fallback
      setTimeout(() => {
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
        resolve(false)
      }, 3000)
    } catch {
      resolve(false)
    }
  })
}

// =============================================================================
// 5. INTERSECTION OBSERVER PROBE - Detects if ad elements are being hidden
// =============================================================================

export async function runIntersectionProbe(): Promise<boolean> {
  if (typeof IntersectionObserver === "undefined" || typeof document === "undefined") {
    return false
  }

  return new Promise((resolve) => {
    try {
      // Create ad-like elements
      const container = document.createElement("div")
      container.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;"

      const adElement = document.createElement("div")
      adElement.className = "ad-banner advertisement sponsored-content"
      adElement.id = "google_ads_iframe_test"
      adElement.style.cssText = "width:300px;height:250px;background:#f0f0f0;"
      adElement.setAttribute("data-ad-slot", "test")

      // Also create a control element that should NOT be hidden
      const controlElement = document.createElement("div")
      controlElement.className = "content-wrapper main-content"
      controlElement.id = "main_content_wrapper"
      controlElement.style.cssText = "width:300px;height:250px;background:#f0f0f0;"

      container.appendChild(adElement)
      container.appendChild(controlElement)
      document.body.appendChild(container)

      let wasVisible = false
      let becameHidden = false

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              wasVisible = true
            } else if (wasVisible) {
              becameHidden = true
            }
          }
        },
        { threshold: 0.01 },
      )

      observer.observe(adElement)

      // Wait and check if element was hidden by ad blocker
      setTimeout(() => {
        observer.disconnect()

        // Check if element was removed or hidden
        const adComputedStyle = window.getComputedStyle(adElement)
        const controlComputedStyle = window.getComputedStyle(controlElement)

        const isAdHidden =
          adComputedStyle.display === "none" ||
          adComputedStyle.visibility === "hidden" ||
          adComputedStyle.opacity === "0" ||
          adElement.offsetParent === null ||
          becameHidden

        const isControlHidden =
          controlComputedStyle.display === "none" ||
          controlComputedStyle.visibility === "hidden" ||
          controlComputedStyle.opacity === "0" ||
          controlElement.offsetParent === null

        container.remove()

        // Only report as blocked if ad is hidden BUT control is visible
        // This prevents false positives from CSS/layout issues
        resolve(isAdHidden && !isControlHidden)
      }, 2000) // Increased timeout
    } catch {
      resolve(false)
    }
  })
}

// =============================================================================
// 6. WEBRTC PROBE - Uses RTCPeerConnection to detect blocking
// =============================================================================

export async function runWebRtcProbe(): Promise<boolean> {
  if (typeof RTCPeerConnection === "undefined") {
    // WebRTC not supported - NOT a sign of blocking, just browser limitation
    return false
  }

  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.services.mozilla.com" }],
      })

      let hasIce = false
      let candidateCount = 0

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          hasIce = true
          candidateCount++
        }
      }

      pc.createDataChannel("probe")
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          // Offer creation failed - could be privacy setting, not blocking
          pc.close()
          resolve(false)
        })

      // Give more time for ICE candidates to arrive
      // Network conditions can delay ICE gathering
      setTimeout(() => {
        pc.close()
        // Only report as blocked if we got ZERO candidates
        // AND the connection was properly established
        // This reduces false positives from slow networks
        resolve(!hasIce && candidateCount === 0)
      }, 4000) // Increased timeout to reduce false positives
    } catch {
      // Errors can happen for many reasons - don't assume blocking
      resolve(false)
    }
  })
}

// =============================================================================
// MASTER PROBE FUNCTION - Runs all invisible probes
// =============================================================================

export interface InvisibleProbeResult {
  beaconBlocked: boolean
  prefetchBlocked: boolean
  cssBackgroundBlocked: boolean
  workerBlocked: boolean
  intersectionHidden: boolean
  webRtcBlocked: boolean
  overallBlocked: boolean
  confidence: number
  probeCount: number
  blockedCount: number
}

export async function runAllInvisibleProbes(): Promise<InvisibleProbeResult> {
  // Run all probes in parallel
  const [beaconBlocked, prefetchBlocked, cssBackgroundBlocked, workerBlocked, intersectionHidden, webRtcBlocked] =
    await Promise.all([
      runBeaconProbe(),
      runPrefetchProbe(),
      runCssBackgroundProbe(),
      runWorkerProbe(),
      runIntersectionProbe(),
      runWebRtcProbe(),
    ])

  const probeOutcomes = [
    beaconBlocked,
    prefetchBlocked,
    cssBackgroundBlocked,
    workerBlocked,
    intersectionHidden,
    webRtcBlocked,
  ]

  const blockedCount = probeOutcomes.filter(Boolean).length
  const probeCount = probeOutcomes.length

  // Calculate confidence based on blocked probes
  // Each probe has different weight
  const weights = {
    beacon: 15,
    prefetch: 12,
    cssBackground: 18,
    worker: 20,
    intersection: 25,
    webRtc: 10,
  }

  let weightedScore = 0
  let totalWeight = 0

  if (beaconBlocked) weightedScore += weights.beacon
  if (prefetchBlocked) weightedScore += weights.prefetch
  if (cssBackgroundBlocked) weightedScore += weights.cssBackground
  if (workerBlocked) weightedScore += weights.worker
  if (intersectionHidden) weightedScore += weights.intersection
  if (webRtcBlocked) weightedScore += weights.webRtc

  totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const confidence = (weightedScore / totalWeight) * 100

  // Store result invisibly
  probeResults.set(probeKey, blockedCount >= 3)

  return {
    beaconBlocked,
    prefetchBlocked,
    cssBackgroundBlocked,
    workerBlocked,
    intersectionHidden,
    webRtcBlocked,
    overallBlocked: blockedCount >= 4, // At least 4 probes blocked (stricter to reduce FP)
    confidence,
    probeCount,
    blockedCount,
  }
}
