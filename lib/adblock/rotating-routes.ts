// =============================================================================
// ROTATING AD-ROUTE ENTROPY SYSTEM
// Makes endpoints unpredictable across sessions to defeat pattern recognition
// =============================================================================

import { generateChecksum } from "./detection-engine"

// Session-unique route generation
const SESSION_SALT = typeof window !== "undefined" ? crypto.randomUUID() : "server"
const ROUTE_VERSION = Date.now()

// Base route patterns that will be rotated
const BASE_PATTERNS = {
  scripts: ["loader", "init", "sdk", "lib", "core", "main", "bundle", "chunk", "module", "runtime"],
  pixels: ["pixel", "beacon", "track", "log", "event", "hit", "ping", "sync", "collect", "measure"],
  images: ["img", "banner", "creative", "asset", "media", "visual", "display", "promo", "hero", "splash"],
  iframes: ["frame", "embed", "widget", "container", "wrapper", "slot", "unit", "placement", "zone", "spot"],
}

// Ad network prefixes to rotate
const NETWORK_PREFIXES = [
  "goog",
  "fb",
  "twtr",
  "msn",
  "yaho",
  "amzn",
  "tktk",
  "snap",
  "pint",
  "lnkd",
  "tabl",
  "outb",
  "crit",
  "trad",
  "pubm",
  "appn",
  "rubcn",
  "idx",
  "sovr",
  "opnx",
]

// Generate a deterministic but unpredictable route based on session
function generateRotatedRoute(baseType: keyof typeof BASE_PATTERNS, index: number): string {
  const patterns = BASE_PATTERNS[baseType]
  const prefix = NETWORK_PREFIXES[index % NETWORK_PREFIXES.length]
  const pattern = patterns[(index + ROUTE_VERSION) % patterns.length]

  // Create a hash-based route segment
  const hashInput = `${SESSION_SALT}-${prefix}-${pattern}-${index}`
  const hash = generateChecksum(hashInput).slice(0, 8)

  return `/api/r/${prefix}_${pattern}_${hash}`
}

// Generate time-based rotating routes (change every 5 minutes)
function generateTimeRotatedRoute(category: string): string {
  const timeSlot = Math.floor(Date.now() / (5 * 60 * 1000)) // 5-minute slots
  const hashInput = `${SESSION_SALT}-${category}-${timeSlot}`
  const hash = generateChecksum(hashInput).slice(0, 12)

  return `/api/t/${category}/${hash}`
}

// Generate all rotated routes for current session
export function getRotatedBaitRoutes(): {
  scripts: string[]
  pixels: string[]
  images: string[]
  iframes: string[]
  timeRotated: string[]
} {
  const scripts: string[] = []
  const pixels: string[] = []
  const images: string[] = []
  const iframes: string[] = []
  const timeRotated: string[] = []

  // Generate 10 routes per category
  for (let i = 0; i < 10; i++) {
    scripts.push(generateRotatedRoute("scripts", i))
    pixels.push(generateRotatedRoute("pixels", i))
    images.push(generateRotatedRoute("images", i))
    iframes.push(generateRotatedRoute("iframes", i))
  }

  // Generate time-rotated routes
  const categories = ["ad", "track", "pixel", "beacon", "analytics", "conversion", "remarketing", "audience"]
  for (const category of categories) {
    timeRotated.push(generateTimeRotatedRoute(category))
  }

  return { scripts, pixels, images, iframes, timeRotated }
}

// Get a random subset of routes for this detection cycle
export function getRandomBaitSubset(count = 15): string[] {
  const allRoutes = getRotatedBaitRoutes()
  const combined = [
    ...allRoutes.scripts,
    ...allRoutes.pixels,
    ...allRoutes.images,
    ...allRoutes.iframes,
    ...allRoutes.timeRotated,
  ]

  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }

  return combined.slice(0, count)
}

// Generate a unique probe URL that's never been seen before
export function generateUniqueProbeUrl(): string {
  const uniqueId = crypto.randomUUID().replace(/-/g, "")
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)

  return `/api/p/${timestamp}${random}/${uniqueId.slice(0, 16)}.js`
}

// Verify if a route matches our rotated pattern (for server-side validation)
export function isValidRotatedRoute(route: string): boolean {
  // Check static patterns
  if (route.startsWith("/api/r/") || route.startsWith("/api/t/") || route.startsWith("/api/p/")) {
    return true
  }

  // Check standard ad patterns
  const standardPatterns = [
    /^\/api\/ads\//,
    /^\/api\/pagead\//,
    /^\/api\/track\//,
    /^\/api\/pixel\//,
    /^\/api\/beacon\//,
  ]

  return standardPatterns.some((p) => p.test(route))
}
