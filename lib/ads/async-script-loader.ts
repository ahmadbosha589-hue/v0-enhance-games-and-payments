/**
 * Highly optimized async ad script loader
 * - Loads scripts without blocking the main thread
 * - Uses requestIdleCallback for non-critical scripts
 * - Implements script caching and deduplication
 * - Supports priority-based loading
 */

type ScriptPriority = "critical" | "high" | "medium" | "low"

interface ScriptConfig {
  src: string
  id: string
  priority: ScriptPriority
  async?: boolean
  defer?: boolean
  attributes?: Record<string, string>
  onLoad?: () => void
  onError?: (error: Error) => void
}

// Track loaded scripts to prevent duplicates
const loadedScripts = new Set<string>()
const loadingScripts = new Map<string, Promise<void>>()

// Script queue for priority-based loading
const scriptQueue: Map<ScriptPriority, ScriptConfig[]> = new Map([
  ["critical", []],
  ["high", []],
  ["medium", []],
  ["low", []],
])

let isProcessingQueue = false

/**
 * Load a script asynchronously without blocking
 */
export function loadScriptAsync(config: ScriptConfig): Promise<void> {
  const { src, id, priority = "medium", async = true, defer = true, attributes, onLoad, onError } = config

  // Already loaded
  if (loadedScripts.has(id)) {
    onLoad?.()
    return Promise.resolve()
  }

  // Currently loading
  if (loadingScripts.has(id)) {
    return loadingScripts.get(id)!.then(onLoad).catch(onError)
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    // Check if script already exists in DOM
    if (document.getElementById(id)) {
      loadedScripts.add(id)
      resolve()
      return
    }

    const script = document.createElement("script")
    script.id = id
    script.src = src
    script.async = async
    script.defer = defer
    
    // Add custom attributes
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        script.setAttribute(key, value)
      })
    }

    script.onload = () => {
      loadedScripts.add(id)
      loadingScripts.delete(id)
      onLoad?.()
      resolve()
    }

    script.onerror = () => {
      loadingScripts.delete(id)
      const error = new Error(`Failed to load script: ${src}`)
      onError?.(error)
      reject(error)
    }

    // Append to head
    document.head.appendChild(script)
  })

  loadingScripts.set(id, loadPromise)
  return loadPromise
}

/**
 * Queue a script for priority-based loading
 */
export function queueScript(config: ScriptConfig): void {
  const queue = scriptQueue.get(config.priority) || []
  queue.push(config)
  scriptQueue.set(config.priority, queue)
  
  if (!isProcessingQueue) {
    processQueue()
  }
}

/**
 * Process the script queue based on priority
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return
  isProcessingQueue = true

  // Process critical scripts immediately
  const critical = scriptQueue.get("critical") || []
  for (const script of critical) {
    await loadScriptAsync(script)
  }
  scriptQueue.set("critical", [])

  // Process high priority scripts
  const high = scriptQueue.get("high") || []
  for (const script of high) {
    await loadScriptAsync(script)
  }
  scriptQueue.set("high", [])

  // Process medium priority scripts after a small delay
  const medium = scriptQueue.get("medium") || []
  if (medium.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const script of medium) {
      await loadScriptAsync(script)
    }
    scriptQueue.set("medium", [])
  }

  // Process low priority scripts during idle time
  const low = scriptQueue.get("low") || []
  if (low.length > 0) {
    await new Promise<void>((resolve) => {
      if ("requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(() => resolve(), { timeout: 5000 })
      } else {
        setTimeout(resolve, 1000)
      }
    })
    
    for (const script of low) {
      await loadScriptAsync(script)
      // Small delay between low priority scripts
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    scriptQueue.set("low", [])
  }

  isProcessingQueue = false
}

/**
 * Ad network configurations with optimized loading
 */
export const AD_NETWORK_SCRIPTS: Record<string, ScriptConfig> = {
  // Google AdSense - Critical for revenue
  googleAdsense: {
    id: "google-adsense",
    src: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
    priority: "high",
    attributes: {
      "data-ad-client": "ca-pub-XXXXXXXXXX",
      crossorigin: "anonymous",
    },
  },
  
  // A-ADS - High priority
  aads: {
    id: "a-ads",
    src: "https://a-ads.com/static/embed.js",
    priority: "high",
  },
  
  // CoinZilla - High priority
  coinzilla: {
    id: "coinzilla",
    src: "https://coinzilla.com/js/coinzilla.js",
    priority: "high",
  },
  
  // BitMedia - Medium priority
  bitmedia: {
    id: "bitmedia",
    src: "https://bitmedia.io/js/adbybm.js",
    priority: "medium",
  },
  
  // CoinTraffic - Medium priority
  cointraffic: {
    id: "cointraffic",
    src: "https://cointraffic.io/js/ct_script.js",
    priority: "medium",
  },
  
  // Adsterra - Medium priority
  adsterra: {
    id: "adsterra",
    src: "https://pl19498017.highrevenuenetwork.com/invoke.js",
    priority: "medium",
  },
  
  // PropellerAds - Medium priority
  propellerads: {
    id: "propellerads",
    src: "https://propellerads.com/js/prop.js",
    priority: "medium",
  },
  
  // HilltopAds - Low priority
  hilltopads: {
    id: "hilltopads",
    src: "https://hilltopads.net/js/ht.js",
    priority: "low",
  },
  
  // TrafficStars - Low priority
  trafficstars: {
    id: "trafficstars",
    src: "https://trafficstars.com/js/ts.js",
    priority: "low",
  },
  
  // MellowAds - Low priority
  mellowads: {
    id: "mellowads",
    src: "https://mellowads.com/js/mellow.js",
    priority: "low",
  },
  
  // AdsKeeper - Low priority
  adskeeper: {
    id: "adskeeper",
    src: "https://adskeeper.com/js/ak.js",
    priority: "low",
  },
  
  // Media.net - Low priority
  medianet: {
    id: "medianet",
    src: "https://contextual.media.net/dmedianet.js",
    priority: "low",
  },
}

/**
 * Load all ad scripts with priority-based ordering
 */
export function loadAllAdScripts(): void {
  // Only run on client
  if (typeof window === "undefined") return

  // Wait for page to be interactive
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleAdScriptLoading()
    })
  } else {
    scheduleAdScriptLoading()
  }
}

function scheduleAdScriptLoading(): void {
  // Use requestIdleCallback if available, otherwise setTimeout
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(() => {
        Object.values(AD_NETWORK_SCRIPTS).forEach(queueScript)
      }, { timeout: 3000 })
  } else {
    setTimeout(() => {
      Object.values(AD_NETWORK_SCRIPTS).forEach(queueScript)
    }, 1000)
  }
}

/**
 * Preconnect to ad network domains for faster loading
 */
export function preconnectAdNetworks(): void {
  if (typeof document === "undefined") return

  const domains = [
    "https://pagead2.googlesyndication.com",
    "https://a-ads.com",
    "https://coinzilla.com",
    "https://bitmedia.io",
    "https://cointraffic.io",
    "https://adsterra.com",
  ]

  domains.forEach((domain) => {
    // Check if preconnect already exists
    const existing = document.querySelector(`link[href="${domain}"][rel="preconnect"]`)
    if (existing) return

    const link = document.createElement("link")
    link.rel = "preconnect"
    link.href = domain
    link.crossOrigin = "anonymous"
    document.head.appendChild(link)
  })
}

export default {
  loadScriptAsync,
  queueScript,
  loadAllAdScripts,
  preconnectAdNetworks,
  AD_NETWORK_SCRIPTS,
}
