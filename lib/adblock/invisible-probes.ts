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

    return blockedCount >= 2 // At least 2 blocked = likely ad blocker
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
          resolve(blockedCount >= 2)
        }
      }

      // Timeout fallback
      setTimeout(() => {
        resolve(blockedCount >= 1)
      }, 2000)
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

        // If fewer than 2 loaded, likely blocked
        resolve(loadedCount < 2)
      }, 1500)
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

        resolve(blockedCount >= 2)
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
      container.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;"

      const adElement = document.createElement("div")
      adElement.className = "ad-banner advertisement sponsored-content"
      adElement.id = "google_ads_iframe_test"
      adElement.style.cssText = "width:300px;height:250px;background:#f0f0f0;"
      adElement.setAttribute("data-ad-slot", "test")

      container.appendChild(adElement)
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
        container.remove()

        // Check if element was removed or hidden
        const computedStyle = window.getComputedStyle(adElement)
        const isHidden =
          computedStyle.display === "none" ||
          computedStyle.visibility === "hidden" ||
          computedStyle.opacity === "0" ||
          adElement.offsetParent === null ||
          becameHidden

        resolve(isHidden)
      }, 1500)
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
    return false
  }

  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.services.mozilla.com" }],
      })

      let hasIce = false

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          hasIce = true
        }
      }

      pc.createDataChannel("probe")
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {})

      setTimeout(() => {
        pc.close()
        // If no ICE candidates, WebRTC might be blocked
        resolve(!hasIce)
      }, 2000)
    } catch {
      resolve(true) // Error likely means blocking
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

  const probeResults = [
    beaconBlocked,
    prefetchBlocked,
    cssBackgroundBlocked,
    workerBlocked,
    intersectionHidden,
    webRtcBlocked,
  ]

  const blockedCount = probeResults.filter(Boolean).length
  const probeCount = probeResults.length

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
    overallBlocked: blockedCount >= 3, // At least 3 probes blocked
    confidence,
    probeCount,
    blockedCount,
  }
}
