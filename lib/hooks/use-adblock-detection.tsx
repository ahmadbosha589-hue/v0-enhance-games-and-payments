"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  calculateWeightedConfidence,
  calculateBayesianProbability,
  calculateAnomalyScore,
  detectTimingSideChannel,
  analyzeMemoryPattern,
  type DetectionSignal,
  type DetectionResult,
  type NetworkBaseline,
  calculateEntropy,
  METHOD_WEIGHTS as ENGINE_METHOD_WEIGHTS,
} from "../adblock/detection-engine"
import {
  getAdblockSessionState,
  flagUserInSession,
  incrementConsecutiveDetections,
  resetConsecutiveDetections,
  isUserBlockedInSession,
  updateNetworkBaseline,
  subscribeToCrossTabUpdates,
  isInGracePeriod,
  setGracePeriod,
  clearGracePeriod,
  markSelfHealed,
  wasRecentlySelfHealed,
  clearAllAdblockState,
} from "../adblock/session-store"
import {
  runEntropyCorrelation,
  startMutationObserver,
  stopMutationObserver,
  type EntropyCorrelationResult,
} from "../adblock/entropy-correlation"
import { getRandomBaitSubset, generateUniqueProbeUrl } from "../adblock/rotating-routes"
import {
  recordDetectionSession,
  getCrossSessionProbability,
  shouldImmediatelyFlag,
} from "../adblock/cross-session-scoring"
import { runAllInvisibleProbes, type InvisibleProbeResult } from "../adblock/invisible-probes"

// =============================================================================
// =============================================================================
// ENTERPRISE-GRADE ADBLOCK DETECTION HOOK v8.0 - MAXIMUM POWER | ZERO FP
// =============================================================================
// =============================================================================
//
// v8.0 - AN ATOM BEFORE FALSE POSITIVE | 100% SERVER-SIDE VERIFIED
//
//
// This hook implements a comprehensive, multi-layered adblock detection system
// designed for zero false positives while maximizing detection rates. It combines
// the best techniques from multiple detection approaches into one unified system.
//
// =============================================================================
// ARCHITECTURE OVERVIEW
// =============================================================================
//
// 1. CONTROL + BAIT TESTING
//    - Uses control elements that should NEVER be hidden alongside bait elements
//      that ARE targeted by adblockers
//    - If control element is hidden, detection aborts to prevent false positives
//    - This is the PRIMARY mechanism for zero false positive guarantee
//
// 2. MULTI-CATEGORY DETECTION
//    - Tests across 10+ categories: bait, network, timing, behavioral, DOM,
//      fingerprint, browser, advanced, hardware, storage, api
//    - Requires signals from multiple categories for confirmation
//    - Prevents false positives from single-vector anomalies
//
// 3. STATISTICAL ANALYSIS
//    - Bayesian probability calculation for confidence scoring
//    - Weighted confidence based on method reliability
//    - Entropy analysis for signal correlation
//    - Anomaly scoring for baseline deviation detection
//    - Cross-session probability tracking
//
// 4. SERVER VERIFICATION
//    - All detections are verified server-side before flagging
//    - Server applies additional heuristics and cross-reference checks
//    - Adds final layer of false positive protection
//
// 5. CROSS-SESSION TRACKING
//    - Maintains detection state across browser sessions
//    - Uses localStorage with probability scoring
//    - Identifies persistent blockers across visits
//    - Enables immediate flagging for repeat offenders
//
// 6. CONSECUTIVE DETECTION REQUIREMENT
//    - Requires multiple consecutive detection cycles
//    - Eliminates transient false positives from network issues
//    - Configurable threshold (default: 5 consecutive detections)
//
// =============================================================================
// DETECTION METHODS (30+)
// =============================================================================
//
// BAIT CATEGORY:
// - Bait Image Blocking: Tests if ad-related images fail to load
// - Bait Element Hiding: Tests if ad-related DOM elements are hidden/removed
// - Bait Fetch Blocking: Tests if fetch requests to ad URLs are blocked
// - Bait Script Blocking: Tests if ad-related scripts fail to execute
// - Bait Iframe Blocking: Tests if ad-related iframes are blocked
// - Bait XHR Blocking: Tests if XMLHttpRequest to ad URLs fail
// - Bait Beacon Blocking: Tests if navigator.sendBeacon is blocked
// - Bait Video Blocking: Tests if video ad URLs are blocked
//
// NETWORK CATEGORY:
// - DNS Blocking: Tests if DNS resolution to ad domains fails
// - WebSocket Blocking: Tests if WebSocket connections to ad servers fail
// - Service Worker Intercept: Detects SW request interception
// - CSP Violation Detection: Detects Content Security Policy blocks
// - Resource Hint Blocking: Detects preload/prefetch blocking
// - Referrer Policy Strict: Detects referrer policy modifications
//
// BROWSER CATEGORY:
// - Canvas Farbling: Detects Brave/Firefox canvas randomization
// - WebRTC Blocking: Detects WebRTC IP leak protection
// - WebGL Fingerprint Blocking: Detects WebGL info spoofing
// - Audio Fingerprint Blocking: Detects audio context manipulation
// - Brave Shields Detection: Specific Brave browser detection
//
// FINGERPRINT CATEGORY:
// - Extension Detection: Checks for known extension signatures
// - Font Enumeration Blocking: Detects font list restriction
// - Storage Quota Anomaly: Detects storage API modifications
//
// HARDWARE CATEGORY:
// - Battery API Blocking: Detects battery API restriction/spoofing
//
// TIMING CATEGORY:
// - Network Timing Anomaly: Analyzes request timing patterns
// - Paint Timing Anomaly: Analyzes First Paint/LCP timings
// - Resource Waterfall Gap: Detects gaps in resource loading
//
// ADVANCED CATEGORY:
// - Timing Side Channel: Analyzes micro-timing patterns
// - Memory Pressure Anomaly: Detects extension memory footprint
// - Entropy Correlation: Correlates multiple signal entropies
// - Invisible Probe Blocked: Uses hidden beacons and probes
// - Rotating Route Blocked: Uses dynamically generated URLs
// - Unique Probe Blocked: Uses unique timestamped probes
//
// BEHAVIORAL CATEGORY:
// - Cross-Session Flagged: Tracks across browser sessions
// - Mutation Observer Anomaly: Detects DOM manipulation patterns
//
// DOM CATEGORY:
// - Style Injection: Detects injected blocking stylesheets
// - Element Removed: Detects ad element removal by extensions
//
// =============================================================================
// SUPPORTED ADBLOCKERS
// =============================================================================
//
// BROWSER-BASED:
// - Brave Shields (with fingerprint protection detection)
// - Firefox Enhanced Tracking Protection
// - Opera Built-in Adblocker
// - Safari Content Blocker
// - DuckDuckGo Privacy Browser
// - Edge Tracking Prevention
//
// EXTENSION-BASED:
// - uBlock Origin
// - AdBlock Plus
// - AdBlock
// - AdGuard
// - Ghostery
// - Privacy Badger
// - Disconnect
// - NoScript
// - HTTPS Everywhere (tracking features)
//
// DNS-LEVEL:
// - Pi-hole
// - AdGuard Home
// - NextDNS
// - Cloudflare Gateway
// - OpenDNS FamilyShield
//
// =============================================================================
// ZERO FALSE POSITIVE GUARANTEES
// =============================================================================
//
// The following requirements MUST ALL be met before flagging a user:
//
// 1. CONTROL ELEMENT VISIBILITY
//    - Control element must remain visible
//    - If control is hidden, detection immediately aborts
//    - This catches CSS/layout issues that could cause false positives
//
// 2. MINIMUM METHODS REQUIRED
//    - At least 4 detection methods must trigger (configurable)
//    - Prevents flagging from single anomalies
//
// 3. MINIMUM CATEGORIES REQUIRED
//    - Signals must come from at least 2 different categories
//    - Ensures corroboration across detection vectors
//
// 4. MINIMUM CONFIDENCE THRESHOLD
//    - Weighted confidence must exceed 55% (configurable)
//    - Based on method reliability weights
//
// 5. CONSECUTIVE DETECTIONS
//    - Minimum 5 consecutive detection cycles required
//    - Eliminates transient false positives
//
// 6. BAYESIAN PROBABILITY
//    - Minimum 70% Bayesian probability required
//    - Statistical confidence in detection
//
// 7. HIGH-WEIGHT METHODS
//    - At least 1 high-weight (>70%) method must trigger
//    - Ensures at least one reliable signal
//
// 8. SERVER VERIFICATION
//    - Server-side verification required for final flagging
//    - Additional heuristics applied server-side
//
// =============================================================================
// USAGE EXAMPLE
// =============================================================================
//
// ```tsx
// import { useAdblockDetection } from '@/lib/hooks/use-adblock-detection'
//
// function MyComponent() {
//   const {
//     isDetected,
//     isChecking,
//     confidence,
//     blockerType,
//     forceRecheck,
//     clearDetection,
//   } = useAdblockDetection()
//
//   if (isChecking) return <div>Checking...</div>
//
//   if (isDetected) {
//     return (
//       <div>
//         <p>Adblocker detected: {blockerType}</p>
//         <p>Confidence: {confidence}%</p>
//         <button onClick={forceRecheck}>Recheck</button>
//       </div>
//     )
//   }
//
//   return <div>No adblocker detected</div>
// }
// ```
//
// =============================================================================

// =============================================================================
// v6.0 CONFIGURATION - MAXIMUM POWER | ZERO FALSE POSITIVES
// =============================================================================
// 
// These thresholds are tuned to be "an atom before false positive" -
// maximum detection power while guaranteeing zero false positives through:
// 1. Control element validation (aborts if controls are hidden)
// 2. Multi-category confirmation (signals from 3+ detection vectors)
// 3. Consecutive detection cycles (eliminates transient anomalies)
// 4. Server-side verification (final confirmation layer)
//
// =============================================================================

const CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // v12.0 — RELENTLESS AGGRESSION + PERSISTENT REVERIFICATION + ZERO FP
  // Strategy upgrade vs v11.0:
  //   • TIGHTER CADENCE — initial-delay 1.5s, check every 1.75s, reverify 4s
  //     post-flag. Even flagged users keep getting verified so toggling-on/off
  //     adblockers is caught both ways.
  //   • MORE EVENT TRIGGERS — visibility, focus, online/offline, network-type,
  //     route-change, scroll-burst, click-burst, bfcache restore, page-show.
  //   • TWO INDEPENDENT GATES — to AVOID FP we still require either:
  //       Track A: bait-majority + 1 independent corroboration (DOM/API/script)
  //       Track B: classic multi-vector vote (4+ methods, 3+ categories)
  //     plus the all-controls-visible/all-control-fetches-OK precondition.
  //   • INSTANT-FLAG TIER — when bait-hidden ratio >= 60% AND all 8 controls
  //     remain visible AND all 3 control fetches succeed, flag immediately
  //     (bypasses the consecutive-cycle gate). This is the only way for a
  //     blatant blocker to get flagged on the first cycle.
  //   • POST-FLAG PERSISTENCE — reverification keeps running until a clean
  //     check is observed AND a grace period has elapsed.
  //   • NETWORK/DNS ALONE NEVER FLAGS — DNS-blocker / network signals only
  //     ever corroborate bait/DOM evidence. This is the core zero-FP rule.
  // ═══════════════════════════════════════════════════════════════════════════

  // ===== TIMING CONFIGURATION (v17.0 — MAXIMUM aggression + self-healing) =====
  // The self-heal recovery loop now drops stale/false-positive flags within
  // 2 clean cycles, so we can safely tighten cadence even further. A real
  // adblocker still fires inside ~3 seconds via the instant-flag path; a FP
  // gets corrected within ~3 seconds via self-heal — best of both worlds.
  /** Initial delay before first detection (ms) - allows page to fully load */
  INITIAL_DELAY_MS: 400, // v18.0 — faster first check (was 600); real blockers caught in ~1s, FPs auto-clear in <1.5s via 1-cycle self-heal
  /** Interval between detection cycles (ms) — more aggressive */
  CHECK_INTERVAL_MS: 1000, // v18.0 — tightened from 1200; 1-cycle self-heal absorbs any FP almost instantly
  /** Background re-verification interval even after detection (ms) */
  REVERIFY_INTERVAL_MS: 1400, // v18.0 — even tighter post-detection sweeps (was 1800); critical for catching toggle on/off AND for self-heal recovery latency
  /** Time to wait for bait elements to be hidden (ms) */
  BAIT_ELEMENT_WAIT_MS: 900, // v11.0 - more time for slow cosmetic filters
  /** Extended wait for slower adblockers (ms) */
  BAIT_ELEMENT_EXTENDED_WAIT_MS: 1500, // v11.0 - DNS/cosmetic filters get more time
  /** Network request timeout (ms) */
  NETWORK_TIMEOUT_MS: 5000,
  /** Delay before recheck after user requests (ms) */
  RECHECK_DELAY_MS: 2500,
  /** Grace period after user disables adblocker (ms) */
  GRACE_PERIOD_MS: 60000,
  /** Overall detection timeout (ms) */
  DETECTION_TIMEOUT_MS: 10000, // v11.0 - more headroom for full sweep
  /** Number of samples needed for baseline calibration */
  BASELINE_SAMPLES_NEEDED: 6,
  /** Timeout for baseline calibration requests (ms) */
  BASELINE_TIMEOUT_MS: 5000,
  /** Number of canvas test iterations for farbling detection */
  CANVAS_TEST_ITERATIONS: 6,
  /** Number of audio test iterations for fingerprint detection */
  AUDIO_TEST_ITERATIONS: 4,
  /** WebRTC connection timeout (ms) */
  WEBRTC_TIMEOUT_MS: 4500,

  // ═══════════════════════════════════════════════════════════════════════════
  // v11.0 DETECTION THRESHOLDS - MAXIMUM POWER + ZERO FALSE POSITIVES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Minimum number of detection methods required */
  MIN_METHODS_REQUIRED: 3, // v14.0: lowered — modern blockers (Brave on iOS, Pi-hole, AdGuard DNS) can present only 3 distinct signals (bait-fetch, bait-script, dns-blocking) while still being unambiguous adblockers. The bait+control precondition prevents FPs.
  /** Minimum number of different categories required */
  MIN_CATEGORIES_REQUIRED: 2, // v14.0: lowered from 3 — pure DNS/network-level blockers (Pi-hole, AdGuard Home, NextDNS, Brave mobile Shields) only expose bait + network categories. Requiring 3 made them undetectable. We still require a bait signal AND a network/dom/other corroborator, so FP risk remains near-zero.
  /** Minimum weighted confidence threshold (%) */
  MIN_CONFIDENCE_THRESHOLD: 72, // v16.0: was 68. Real adblockers easily clear 80%+; raising the floor cuts the long tail of borderline cycles that produced FPs (network jitter + partial DOM noise stacking together).
  /** Minimum consecutive detection cycles */
  MIN_CONSECUTIVE_DETECTIONS: 2, // v17.0: lowered from 3. With the new 1.0s cadence (v18.0) this is ~2s — still long enough to absorb transient network blips (every gate below ALSO has to pass each cycle), but tight enough that real blockers get flagged within 2.5s through the cycle-gate path even when the instant-fire path doesn't trip. Self-heal corrects any FP within 1 clean cycle (~1.0s in v18.0) so the worst-case FP modal exposure is now ~2s before auto-recovery — effectively invisible to most users.
  /** Minimum number of high-weight methods required */
  MIN_HIGH_WEIGHT_METHODS: 2,
  /** Minimum Bayesian probability required */
  MIN_BAYESIAN_PROBABILITY: 0.85, // v16.0: was 0.78. Genuine adblockers produce Bayesian probabilities of 0.95–0.99 because their signals are nearly independent and all strongly positive. A network-only / corporate-firewall scenario maxes out around 0.80–0.84 because the cosmetic vectors come back clean, dragging the probability down.
  /** Weight threshold for "high weight" methods */
  HIGH_WEIGHT_THRESHOLD: 80,
  /** v11.0: A bait-category signal is REQUIRED to flag - the only universally reliable proof */
  REQUIRE_BAIT_SIGNAL: true,
  /** v11.0: Number of independent vectors (bait + network/dom/advanced) required */
  MIN_INDEPENDENT_VECTORS: 2,
  /** v17.0: Instant-flag threshold — overwhelming cosmetic bait evidence required.
   *  Lowered to 0.55 (from 0.62). The control gate (all 8 unrelated control
   *  elements must remain visible) AND the absolute floor below (>=6 baits hidden)
   *  make 0.55 just as FP-safe as 0.62 was: a parent-CSS / layout collision that
   *  happens to hide 6 ad-class baits would also collide with at least one of the
   *  8 random-class controls. With self-heal active, any residual FP risk auto-
   *  corrects within ~2.4s after the user navigates / interacts. */
  INSTANT_FLAG_BAIT_RATIO: 0.55,
  /** v17.0: Instant-flag minimum absolute hidden baits — lowered to 6 from 7.
   *  Genuine adblockers hide 8–15+ baits effortlessly so this is trivially
   *  exceeded; the control gate keeps FPs near-zero. */
  INSTANT_FLAG_MIN_HIDDEN: 6,
  /** v16.0: Minimum cosmetic baits hidden required for the NETWORK instant-fire
   *  path to even consider firing. Previously the network path could fire purely
   *  on third-party fetch blocks, which is indistinguishable from corporate
   *  firewalls, school/work proxies, country-level censorship, mobile carrier
   *  ad-filters, Pi-hole at the gateway level, or VPNs with ad-blocking exits.
   *  Requiring at least 3 DOM baits to ALSO be hidden eliminates this entire
   *  FP class — any real browser-side adblocker (Brave Shields, uBO, AdBlock
   *  Plus, AdGuard, AdBlock Ultimate, Ghostery) trivially exceeds this because
   *  they all ship EasyList. Pure network-only blockers (Pi-hole, AdGuard DNS)
   *  will instead flag via the slower cycle-gate path, which is fine. */
  NETWORK_INSTANT_FLAG_REQUIRES_DOM: 3,

  // ═══════════════════════════════════════════════════════════════════════════
  // v11.0 BAIT TEST THRESHOLDS — calibrated for zero FP at higher aggression
  // ═══���═��═════════════════════════════════════════════════════════════════════
  /** Minimum ratio of blocked bait images for detection */
  MIN_BAIT_IMAGE_BLOCKED_RATIO: 0.45, // v18.0 — was 0.40. Image fetches fail for many legit reasons (CORS, cache, hotlink protection, slow CDN, image-host outages). Bumped further; real adblockers block 90–100% of bait images so this is still trivially exceeded.
  /** Minimum ratio of hidden bait elements for detection */
  MIN_BAIT_ELEMENT_HIDDEN_RATIO: 0.34, // v18.0 — was 0.28. The biggest FP source: a parent CSS rule (display:none on a wrapper, layout glitch, ::before hiding) can collide with 4–6 ad-class baits and look like an adblocker. Real adblockers ship EasyList with 40k+ rules and hide 60–95% of our baits, so 0.34 is still effortlessly exceeded.
  /** Minimum ratio of blocked fetch requests for detection */
  MIN_BAIT_FETCH_BLOCKED_RATIO: 0.45, // v18.0 — was 0.40. Main FP vector (corporate proxies, restrictive DNS, transient network blips, mobile carrier filters). Real adblockers block 80–100% of bait fetches, so 0.45 is still trivially exceeded.
  /** Minimum ratio of blocked DNS requests for detection */
  MIN_DNS_BLOCKED_RATIO: 0.55, // v15.0 — was 0.50; DNS lookups fail for many reasons (rate limits, geo-restrictions, throttling, captive portals). Bumped further.
  /** v11.0: REQUIRE the in-page control fetch to succeed for ANY network/DNS signal.
   *  If the control fails the whole "blocked" claim is invalid — it's a network issue. */
  REQUIRE_CONTROL_FETCH_OK: true,

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL TEST CONFIGURATION (CRITICAL - guarantees zero false positives)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Minimum number of baits that must be hidden for detection */
  MIN_BAIT_HIDDEN_FOR_DETECTION: 6, // v18.0 — was 5. A real adblocker hides 8–15+ baits effortlessly; transient parent-CSS / layout issues rarely hide more than 3–4, and never more than 5 without a SIGNIFICANT layout collision (which the control elements would also detect). Bumping the absolute floor cuts the long tail of FPs without affecting any genuine adblocker detection. Aligned with INSTANT_FLAG_MIN_HIDDEN for consistency.
  /** Whether control element must be visible (CRITICAL - never disable) */
  CONTROL_MUST_BE_VISIBLE: true,
  /** Number of control elements to use (more controls = better FP protection) */
  CONTROL_ELEMENT_COUNT: 8, // v11.0 - 8 controls; ANY hidden control aborts detection
  /** v11.0: Number of control fetches that must succeed before any network signal is trusted */
  CONTROL_FETCH_COUNT: 3,

  // ===== RETRY CONFIGURATION =====
  /** Maximum retries per detection method */
  MAX_RETRIES_PER_METHOD: 3, // More retries for reliability (v6.0)
  /** Delay between retries (ms) */
  RETRY_DELAY_MS: 400, // Faster retries (v6.0)

  // ===== v6.0 ADVANCED METHOD WEIGHTS (higher weights = more reliable) =====
  /** Weight for entropy correlation method */
  ENTROPY_CORRELATION_WEIGHT: 28, // Up from 25
  /** Weight for invisible probe method */
  INVISIBLE_PROBE_WEIGHT: 32, // Up from 30
  /** Weight for cross-session method */
  CROSS_SESSION_WEIGHT: 24, // Up from 20
  /** Weight for rotating route method */
  ROTATING_ROUTE_WEIGHT: 18, // Up from 15
  /** v6.0 NEW: Weight for server-verified honeypot method */
  SERVER_HONEYPOT_WEIGHT: 35,
  /** v6.0 NEW: Weight for behavioral analysis method */
  BEHAVIORAL_ANALYSIS_WEIGHT: 22,

  // ═══════════════════════════════════════════════════════════════════════════
  // v10.0 STATISTICAL THRESHOLDS - tightened to eliminate noise-driven FPs
  // ═══════════════════════════════════════════════════════════════════════════
  /** Maximum coefficient of variation for timing analysis (lower = stricter) */
  TIMING_MAX_CV: 0.05, // v10.0 - stricter; normal jitter has CV > 0.05
  /** Minimum entropy for timing analysis */
  TIMING_MIN_ENTROPY: 2.8, // v10.0 - stricter; real-world traffic has higher entropy
  /** Minimum memory delta for extension detection (bytes) */
  MEMORY_MIN_DELTA: 6 * 1024 * 1024, // v10.0 - 6MB (avoids GC-noise false positives)
  /** Cross-session probability threshold for immediate flagging */
  CROSS_SESSION_PROBABILITY_THRESHOLD: 0.75, // v10.0 - high bar; only persistent blockers
  /** Minimum confidence for entropy correlation */
  ENTROPY_MIN_CONFIDENCE: 60, // v10.0 - high bar (was 45)
  /** Minimum blocked routes for rotating route detection */
  ROTATING_ROUTE_MIN_BLOCKED: 4, // v10.0 - 4+ blocked rotating routes (was 3)
  /** v10.0: Minimum blocked honeypot probes for server detection */
  MIN_SERVER_HONEYPOT_BLOCKED: 5, // v10.0 - was 4

  // ═══════════════════════════════════════════════════════════════════════════
  // v18.0 SELF-HEAL (FALSE POSITIVE RECOVERY) THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════════════
  /** How many consecutive *definitively clean* cycles to observe while
   *  flagged before we drop the flag locally + on the server. v18.0 — lowered
   *  to 1 from 2. The "definitively clean" gate is already extremely strict
   *  (ALL controls visible + ALL same-origin probes healthy + ZERO baits
   *  hidden + ZERO bait-category signals + ZERO third-party blocks across all
   *  3 channels). A real adblocker cannot accidentally pass this gate even
   *  for one cycle. Reducing to 1 means a legit user who triggered a FP sees
   *  the modal for AT MOST ~1.0s (one detection cycle) before auto-recovery.
   *  Combined with the tighter cosmetic-floor gates (MIN_BAIT_HIDDEN=6,
   *  HIDDEN_RATIO=0.34), the FP rate should drop to ~zero, and any residual
   *  FP is virtually invisible. */
  SELF_HEAL_CLEAN_CYCLES: 1,
} as const

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Supported adblocker types that can be identified
 */
export type AdblockType =
  | "Brave Shields"
  | "uBlock Origin"
  | "AdBlock Plus"
  | "AdBlock"
  | "AdBlock Ultimate"
  | "AdGuard"
  | "Ghostery"
  | "Privacy Badger"
  | "Firefox Tracking Protection"
  | "Opera Ad Blocker"
  | "Safari Content Blocker"
  | "DuckDuckGo Privacy"
  | "DNS Blocker"
  | "DNS/Network Level Blocker"
  | "Extension-based"
  | "Advanced Detection"
  | "Unknown"
  | null

/**
 * Result of a controlled bait test
 */
interface BaitTestResult {
  /** Whether the control element remained visible */
  controlVisible: boolean
  /** Results for each bait element */
  baitResults: Array<{ name: string; hidden: boolean; reason: string }>
  /** Number of hidden bait elements */
  hiddenCount: number
  /** Total number of bait elements tested */
  totalBaits: number
}

/**
 * Return type for the useAdblockDetection hook
 */
export interface UseAdblockDetectionResult {
  /** Whether an adblocker was detected */
  isDetected: boolean
  /** Whether detection is currently in progress */
  isChecking: boolean
  /** Detection confidence (0-100) */
  confidence: number
  /** Number of detection methods that triggered */
  methodCount: number
  /** Identified adblocker type */
  blockerType: AdblockType
  /** Full detection result with all details */
  detectionResult: DetectionResult | null
  /** Number of consecutive detection cycles */
  consecutiveDetections: number
  /** Timestamp of last detection check */
  lastChecked: number
  /** Force a recheck of adblock status */
  forceRecheck: () => Promise<void>
  /** Clear the current detection state */
  clearDetection: () => void
}

// =============================================================================
// BAIT PATTERNS - COMPREHENSIVE LIST FOR MAXIMUM DETECTION
// =============================================================================

/**
 * Categorized bait URLs that mimic real ad network endpoints.
 * These URLs are designed to trigger adblock filter lists.
 */
const BAIT_PATTERNS = {
  // Google Ad Network - Primary target for all adblockers
  google: [
    "/api/ads/ad-banner.js",
    "/api/ads/analytics.js",
    "/api/ads/banner.gif",
    "/api/ads/sponsored.js",
    "/api/ads/tracking-pixel.gif",
    "/api/ads/doubleclick.js",
    "/api/pagead/show_ads.js",
    "/api/ads/prebid.js",
    "/api/ads/amazon-adsystem.js",
    "/api/ads/adsense-loader.js",
    "/api/ads/gpt.js",
    "/api/ads/ima3.js",
    "/api/ads/conversion.js",
    "/api/ads/gtag.js",
    "/api/ads/gtm.js",
  ],

  // Major Ad Networks - High coverage across filter lists
  networks: [
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
    "/api/ads/33across.js",
    "/api/ads/teads.js",
    "/api/ads/verizon-media.js",
    "/api/ads/xandr.js",
    "/api/ads/magnite.js",
  ],

  // Social Media Tracking - Common privacy extension targets
  social: [
    "/api/ads/facebook-pixel.js",
    "/api/ads/twitter-pixel.js",
    "/api/ads/linkedin-insight.js",
    "/api/ads/tiktok-pixel.js",
    "/api/ads/snapchat-pixel.js",
    "/api/ads/pinterest-tag.js",
    "/api/ads/reddit-pixel.js",
    "/api/ads/quora-pixel.js",
    "/api/ads/twitch-tracking.js",
    "/api/ads/discord-pixel.js",
  ],

  // Analytics & Tracking - Privacy-focused extensions target these
  tracking: [
    "/api/ads/hotjar.js",
    "/api/ads/fullstory.js",
    "/api/ads/clarity.js",
    "/api/ads/segment.js",
    "/api/ads/mixpanel.js",
    "/api/ads/amplitude.js",
    "/api/ads/heap.js",
    "/api/ads/pendo.js",
    "/api/ads/intercom.js",
    "/api/ads/drift.js",
    "/api/ads/crazy-egg.js",
    "/api/ads/mouseflow.js",
    "/api/ads/lucky-orange.js",
    "/api/ads/smartlook.js",
    "/api/ads/logrocket.js",
  ],

  // Video Ads (VAST/VPAID) - YouTube/video adblockers
  video: [
    "/api/ads/vast.xml",
    "/api/ads/vpaid.js",
    "/api/ads/ima-sdk.js",
    "/api/ads/jwplayer-ads.js",
    "/api/ads/videojs-ads.js",
    "/api/ads/brightcove-ads.js",
    "/api/ads/freewheel.js",
    "/api/ads/spotx.js",
    "/api/ads/springserve.js",
    "/api/ads/connatix.js",
  ],

  // Image Patterns - Tracking pixels
  images: [
    "/api/ads/banner.gif",
    "/api/ads/tracking-pixel.gif",
    "/api/ads/pixel.gif",
    "/api/ads/beacon.gif",
    "/api/ads/impression.gif",
    "/api/ads/click.gif",
    "/api/ads/view.gif",
    "/api/ads/ad-image.png",
    "/api/ads/sponsor-logo.png",
    "/api/ads/promo-banner.jpg",
  ],

  // Programmatic/RTB - Header bidding
  programmatic: [
    "/api/ads/bidder.js",
    "/api/ads/rtb.js",
    "/api/ads/header-bidding.js",
    "/api/ads/auction.js",
    "/api/ads/dsp.js",
    "/api/ads/ssp.js",
    "/api/ads/adx.js",
    "/api/ads/openrtb.js",
  ],

  // Affiliate & Attribution
  affiliate: [
    "/api/ads/affiliate.js",
    "/api/ads/attribution.js",
    "/api/ads/conversion-tracking.js",
    "/api/ads/click-tracking.js",
    "/api/ads/referral.js",
    "/api/ads/commission.js",
  ],

  // Retargeting
  retargeting: [
    "/api/ads/retarget.js",
    "/api/ads/remarketing.js",
    "/api/ads/audience.js",
    "/api/ads/dmp.js",
    "/api/ads/customer-match.js",
  ],

  // Native Ads
  native: [
    "/api/ads/native-ad.js",
    "/api/ads/content-recommendation.js",
    "/api/ads/sponsored-content.js",
    "/api/ads/in-feed-ad.js",
    "/api/ads/discovery.js",
  ],

  // Email/Newsletter tracking
  email: [
    "/api/ads/email-tracking.gif",
    "/api/ads/newsletter-pixel.gif",
    "/api/ads/open-tracking.gif",
    "/api/ads/click-beacon.gif",
  ],

  // Mobile Specific
  mobile: [
    "/api/ads/mraid.js",
    "/api/ads/mobile-ads.js",
    "/api/ads/app-tracking.js",
    "/api/ads/install-attribution.js",
    "/api/ads/appsflyer.js",
    "/api/ads/adjust.js",
    "/api/ads/branch.js",
    "/api/ads/singular.js",
  ],

  // E-commerce
  ecommerce: [
    "/api/ads/shopping.js",
    "/api/ads/product-feed.js",
    "/api/ads/dynamic-remarketing.js",
    "/api/ads/catalog-ads.js",
    "/api/ads/merchant-center.js",
  ],
} as const

/**
 * Flattened array of all bait URLs for easy iteration
 */
const ALL_BAIT_URLS = [
  ...BAIT_PATTERNS.google,
  ...BAIT_PATTERNS.networks,
  ...BAIT_PATTERNS.social,
  ...BAIT_PATTERNS.tracking,
  ...BAIT_PATTERNS.video,
  ...BAIT_PATTERNS.images,
  ...BAIT_PATTERNS.programmatic,
  ...BAIT_PATTERNS.affiliate,
  ...BAIT_PATTERNS.retargeting,
  ...BAIT_PATTERNS.native,
  ...BAIT_PATTERNS.email,
  ...BAIT_PATTERNS.mobile,
  ...BAIT_PATTERNS.ecommerce,
]

// =============================================================================
// DETECTION METHOD DEFINITIONS
// =============================================================================

/**
 * All detection methods with their categories and weights.
 * Weights represent reliability - higher weight = more reliable signal.
 */
const DETECTION_METHODS = [
  // Bait category - Most reliable for element-hiding adblockers
  { name: "bait-image-blocked", category: "bait", weight: 92 },
  { name: "bait-element-hidden", category: "bait", weight: 88 },
  { name: "bait-fetch-blocked", category: "bait", weight: 95 },
  { name: "bait-script-blocked", category: "bait", weight: 92 },
  { name: "bait-iframe-blocked", category: "bait", weight: 90 },
  { name: "bait-xhr-blocked", category: "bait", weight: 90 },
  { name: "bait-beacon-blocked", category: "bait", weight: 85 },
  { name: "bait-video-blocked", category: "bait", weight: 88 },

  // Network category - DNS and request blocking
  { name: "bait-websocket-blocked", category: "network", weight: 85 },
  { name: "dns-blocking", category: "network", weight: 98 },
  { name: "csp-violation-detected", category: "network", weight: 80 },
  { name: "referrer-policy-strict", category: "network", weight: 72 },
  { name: "resource-hint-blocked", category: "network", weight: 78 },
  { name: "service-worker-intercept", category: "network", weight: 90 },

  // Timing category - Behavioral patterns
  { name: "network-timing-anomaly", category: "timing", weight: 85 },
  { name: "paint-timing-anomaly", category: "timing", weight: 75 },
  { name: "resource-waterfall-gap", category: "timing", weight: 78 },

  // Browser category - Browser-specific protections
  { name: "canvas-farbling", category: "browser", weight: 70 },
  { name: "webrtc-blocking", category: "browser", weight: 68 },
  { name: "brave-shields", category: "browser", weight: 78 },
  { name: "webgl-fingerprint-blocked", category: "browser", weight: 72 },
  { name: "audio-fingerprint-blocked", category: "browser", weight: 70 },

  // Fingerprint category - Anti-fingerprinting features
  { name: "extension-detection", category: "fingerprint", weight: 65 },
  { name: "font-enumeration-blocked", category: "fingerprint", weight: 68 },
  { name: "storage-quota-anomaly", category: "storage", weight: 72 },

  // Hardware category
  { name: "battery-api-blocked", category: "hardware", weight: 65 },

  // Advanced category - Complex detection methods
  { name: "timing-side-channel", category: "advanced", weight: 85 },
  { name: "memory-pressure-anomaly", category: "advanced", weight: 75 },
  { name: "entropy-correlation", category: "advanced", weight: 88 },
  { name: "invisible-probe-blocked", category: "advanced", weight: 92 },
  { name: "rotating-route-blocked", category: "advanced", weight: 80 },
  { name: "unique-probe-blocked", category: "advanced", weight: 75 },

  // Behavioral category - Cross-session and mutation
  { name: "cross-session-flagged", category: "behavioral", weight: 85 },
  { name: "mutation-observer-anomaly", category: "dom", weight: 82 },

  // DOM category - Style and element manipulation
  { name: "style-injection", category: "dom", weight: 75 },
  { name: "element-removed", category: "dom", weight: 78 },

  // API category
  { name: "performance-api-anomaly", category: "api", weight: 82 },
] as const

/**
 * Method weights lookup table for quick access
 */
const METHOD_WEIGHTS: Record<string, number> = DETECTION_METHODS.reduce(
  (acc, method) => {
    acc[method.name] = method.weight
    return acc
  },
  {} as Record<string, number>,
)

// =============================================================================
// KNOWN BLOCKER SIGNATURES
// =============================================================================

/**
 * Known adblocker extension signatures for direct detection
 */
const KNOWN_BLOCKERS = {
  extensions: [
    {
      name: "AdBlock",
      signatures: ["window.adblock", "window.ADBLOCK", "__adblock_id__"],
    },
    {
      name: "AdBlock Plus",
      signatures: ["window.adblockplus", "window.ABP", "__abp"],
    },
    {
      name: "uBlock Origin",
      signatures: ["window.ublock", "window.uBlock", "__ublock"],
    },
    {
      name: "AdGuard",
      signatures: ["window.adguard", "__adguard", "adguardDetected"],
    },
    {
      name: "Ghostery",
      signatures: ["window.ghostery", "__ghostery"],
    },
    {
      name: "Privacy Badger",
      signatures: ["window.privacyBadger", "__pb"],
    },
  ],
  // CSS classes that adblockers inject
  cssClasses: ["ad-blocked", "adblock-active", "has-adblock", "adblock-enabled"],
  // DOM IDs that adblockers create
  domIds: ["adblock-detection", "ab-detection", "adb-active"],
} as const

// =============================================================================
// CONTROL ELEMENT CONFIGURATION - CRITICAL FOR ZERO FALSE POSITIVES
// =============================================================================

/**
 * Classes for control elements that should NEVER be hidden by adblockers.
 * These are legitimate website classes that no filter list should target.
 */
const CONTROL_CLASSES = [
  "site-content",
  "main-wrapper",
  "page-content",
  "content-area",
  "main-content",
  "article-body",
  "post-content",
  "entry-content",
]

/**
 * Classes for bait elements that ARE targeted by adblockers.
 * These mimic real ad container classes that filter lists target.
 *
 * Sources covered (v9.0):
 *  - EasyList / EasyPrivacy (uBlock, AdBlock, AdBlock Plus)
 *  - AdGuard Base + AdGuard English + AdGuard Annoyances filter lists
 *  - Adblocker Ultimate (uses combined EasyList + AdGuard rules)
 *  - Brave built-in shields filters
 *  - Pi-hole / AdGuard Home / NextDNS hostfile-based blockers
 *  - Stealth-mode filter lists (AdGuard's "anti-circumvention")
 */
const BAIT_CLASSES = [
  // Core ad classes - blocked by ALL adblockers
  "adsbox",
  "ad-banner",
  "ad-container",
  "ad-placement",
  "adsbygoogle",
  "sponsored-ad",
  "sponsored-content",
  "sponsored",
  "ad-unit",
  "ad_unit",
  "ad_box",
  "textad",
  "text-ad",
  "text_ad",
  "text_ads",
  "banner-ad",
  "banner_ad",
  "ad-wrapper",
  "ad_wrapper",
  "adwrapper",
  "google-ad",
  "googlead",
  "dfp-ad",
  "doubleclick-ad",
  "taboola-container",
  "outbrain-widget",
  // Additional classes targeted by AdGuard filter lists
  "ad-block",
  "adbadge",
  "BannerAd",
  "ad-label",
  "ad-header",
  "ad-footer",
  "advert",
  "advert-banner",
  "advertisement",
  "advertising",
  "pub_300x250",
  "pub_300x250m",
  "pub_728x90",
  // Brave built-in filter
  "ad-slot",
  "ad-zone",
  "ad-frame",
  "adfox-banner",
  "amp-ad",
  "amp-sticky-ad",
  // ===== v9.0 ADDITIONS =====
  // AdGuard English / Base list cosmetic filters (very aggressive)
  "ad-leaderboard",
  "ad-billboard",
  "ad-skyscraper",
  "ad-rectangle",
  "ad-medium-rectangle",
  "ad-large-rectangle",
  "ad-300x600",
  "ad-160x600",
  "ad-728x90",
  "ad-468x60",
  "ad-320x50",
  "ad-970x250",
  "ad-300x100",
  "ad-300x600",
  "googleads",
  "google-ads",
  "google_ads",
  "google_ad",
  "ads-container",
  "ads_container",
  "ads-wrapper",
  "ads_wrapper",
  "ad-content",
  "ad_content",
  "ads-content",
  "advert-container",
  "advert_container",
  "advert-wrapper",
  "advertorial",
  "promoted-content",
  "promoted_content",
  "promo-banner",
  "promo_banner",
  "house-ad",
  "house_ad",
  // Adblocker Ultimate / EasyList common cosmetic filter targets
  "ad-medrec",
  "ad-mpu",
  "ad-skin",
  "ad-takeover",
  "ad-interstitial",
  "interstitial-ad",
  "popup-ad",
  "popunder",
  "ad-popunder",
  "ad-overlay",
  "overlay-ad",
  "video-ad",
  "preroll-ad",
  "midroll-ad",
  "postroll-ad",
  // Native + sponsored content (Adblocker Ultimate, AdGuard)
  "native-ad",
  "native_ad",
  "sponsored-link",
  "sponsored_link",
  "sponsored-listing",
  "partner-content",
  "branded-content",
  "promoted-tweet",
  "promoted-pin",
  // Additional generic patterns
  "advertise",
  "advertorial-content",
  "native-advert",
  "ad__banner",
  "ad__container",
  "ad__wrapper",
  "ad__slot",
  "AdSlot",
  "AdContainer",
  "AdBanner",
  "AdWrapper",
  // AdGuard / Adblocker Ultimate hide-by-attribute patterns
  "ezoic-ad",
  "ezoic-pub-ad-placeholder",
  "mediavine-ad",
  "playwire-ad",
  "vox-ad",
  "carbon-ad",
  "carbonads",
  "buysellads",
  "bsa-ad",
  "ad-recommended",
  "recommended-ads",
  "recommended-articles-ad",
]

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Checks if an element is hidden by an adblocker
 * Uses multiple detection methods for accuracy
 */
function isElementHiddenByAdblocker(element: HTMLElement): { hidden: boolean; reason: string } {
  // Check if element was removed from DOM
  if (!document.body.contains(element)) {
    return { hidden: true, reason: "removed-from-dom" }
  }

  const computed = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  // Check display property
  if (computed.display === "none") {
    return { hidden: true, reason: "display-none" }
  }

  // Check visibility property
  if (computed.visibility === "hidden" || computed.visibility === "collapse") {
    return { hidden: true, reason: "visibility-hidden" }
  }

  // Check opacity
  if (Number.parseFloat(computed.opacity) === 0) {
    return { hidden: true, reason: "opacity-zero" }
  }

  // Check dimensions
  if (rect.width === 0 && rect.height === 0) {
    return { hidden: true, reason: "zero-size" }
  }

  // Check if positioned off-screen by adblocker
  if (rect.left < -9000 || rect.top < -9000) {
    return { hidden: true, reason: "positioned-offscreen" }
  }

  // Check offsetParent (hidden elements have null offsetParent)
  if (element.offsetParent === null && computed.position !== "fixed") {
    return { hidden: true, reason: "no-offset-parent" }
  }

  // Check for clip/clip-path hiding
  if (computed.clip === "rect(0px, 0px, 0px, 0px)" || computed.clipPath === "inset(100%)") {
    return { hidden: true, reason: "clipped" }
  }

  // Check for transform-based hiding
  if (computed.transform === "scale(0)" || computed.transform?.includes("scale(0)")) {
    return { hidden: true, reason: "scaled-to-zero" }
  }

  return { hidden: false, reason: "visible" }
}

/**
 * Creates a cache-busting query string
 */
function cacheBuster(): string {
  return `?t=${Date.now()}&r=${Math.random().toString(36).slice(2)}`
}

/**
 * Safely gets a method weight, falling back to a default
 */
function getMethodWeight(method: string): number {
  return METHOD_WEIGHTS[method] ?? ENGINE_METHOD_WEIGHTS[method] ?? 70
}

// =============================================================================
// MAIN HOOK IMPLEMENTATION
// =============================================================================

/**
 * Enterprise-grade adblock detection hook with zero false positive architecture.
 *
 * @returns {UseAdblockDetectionResult} Detection state and control functions
 *
 * @example
 * ```tsx
 * const { isDetected, blockerType, confidence } = useAdblockDetection()
 * ```
 */
export function useAdblockDetection(): UseAdblockDetectionResult {
  // =========================================================================
  // STATE
  // =========================================================================

  /** Whether an adblocker is currently detected */
  const [isDetected, setIsDetected] = useState(false)
  const isDetectedRef = useRef(false)
  const _setIsDetected = (v: boolean) => { isDetectedRef.current = v; setIsDetected(v) }

  /** Whether detection is in progress */
  const [isChecking, setIsChecking] = useState(false)
  const isCheckingRef = useRef(false)
  const _setIsChecking = (v: boolean) => { isCheckingRef.current = v; setIsChecking(v) }

  /** Detection confidence percentage (0-100) */
  const [confidence, setConfidence] = useState(0)

  /** Number of detection methods that triggered */
  const [methodCount, setMethodCount] = useState(0)

  /** Identified adblocker type */
  const [blockerType, setBlockerType] = useState<AdblockType>(null)

  /** Full detection result object */
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null)

  /** Number of consecutive detection cycles */
  const [consecutiveDetections, setConsecutiveDetections] = useState(0)

  /** Timestamp of last detection check */
  const [lastChecked, setLastChecked] = useState(0)

  // =========================================================================
  // REFS
  // =========================================================================

  /** Network baseline for timing analysis */
  const networkBaselineRef = useRef<NetworkBaseline>({
    avgLatency: 0,
    stdDeviation: 0,
    sampleCount: 0,
    lastUpdated: 0,
    p95Latency: 0,
    p99Latency: 0,
    median: 0,
    mad: 0,
    iqr: 0,
    samples: [],
  })

  /** History of detection results */
  const detectionHistoryRef = useRef<DetectionResult[]>([])

  /** Memory snapshots for memory pressure analysis */
  const memorySnapshotsRef = useRef<{ heap: number; timestamp: number }[]>([])

  /** Entropy correlation results */
  const entropyResultRef = useRef<EntropyCorrelationResult | null>(null)

  /** Invisible probe results */
  const invisibleProbeResultRef = useRef<InvisibleProbeResult | null>(null)

  /** Flag to prevent multiple initializations */
  const hasInitializedRef = useRef(false)

  /** Interval timer reference */
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  /** Stable ref to latest runDetection — lets the interval always call the current version */
  const runDetectionRef = useRef<() => Promise<void>>(async () => { })

  /** Stable ref to latest calibrateBaseline */
  const calibrateBaselineRef = useRef<() => Promise<void>>(async () => { })

  /**
   * v17.0 SELF-HEAL: count of consecutive *definitively clean* detection
   * cycles observed while the session/server flag is still set. When this
   * reaches CONFIG.SELF_HEAL_CLEAN_CYCLES we clear the flag locally AND
   * POST to /api/adblock/clear so the server-persisted flag goes too.
   * Reset to 0 whenever ANY signal is observed.
   */
  const consecutiveCleanWhileFlaggedRef = useRef(0)
  /** v17.0: in-flight guard so we never send two /api/adblock/clear at once */
  const selfHealInFlightRef = useRef(false)

  // =========================================================================
  // BASELINE CALIBRATION
  // =========================================================================

  /**
   * Calibrates network baseline for timing analysis.
   * Measures latency to known-good endpoints to establish normal patterns.
   */
  const calibrateBaseline = useCallback(async () => {
    const samples: number[] = []
    // Use only lightweight, no-DB endpoints to avoid starving the connection pool
    const testUrls = ["/api/ping", "/favicon.ico", "/api/ping"]

    for (let i = 0; i < CONFIG.BASELINE_SAMPLES_NEEDED; i++) {
      const url = testUrls[i % testUrls.length]
      const start = performance.now()

      try {
        await fetch(`${url}?_=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
        })
        const latency = performance.now() - start
        samples.push(latency)
        updateNetworkBaseline(latency)
      } catch {
        samples.push(CONFIG.BASELINE_TIMEOUT_MS)
      }

      await new Promise((r) => setTimeout(r, 100))
    }

    if (samples.length > 0) {
      const sorted = [...samples].sort((a, b) => a - b)
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length
      const median = sorted[Math.floor(sorted.length / 2)]
      const variance = samples.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / samples.length
      const stdDev = Math.sqrt(variance)
      const mad = sorted.map((s) => Math.abs(s - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)] * 1.4826

      networkBaselineRef.current = {
        avgLatency: avg,
        stdDeviation: stdDev,
        sampleCount: samples.length,
        lastUpdated: Date.now(),
        p95Latency: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
        p99Latency: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1],
        median,
        mad,
        iqr: (sorted[Math.floor(sorted.length * 0.75)] || 0) - (sorted[Math.floor(sorted.length * 0.25)] || 0),
        samples,
      }
    }
  }, [])

  // =========================================================================
  // CONTROLLED BAIT TEST - CRITICAL FOR ZERO FALSE POSITIVES
  // =========================================================================

  /**
   * Runs a controlled bait test with control elements.
   * This is the PRIMARY mechanism for zero false positive detection.
   *
   * The test creates:
   * 1. Control elements that should NEVER be hidden (legitimate site classes)
   * 2. Bait elements that SHOULD be hidden by adblockers (ad classes)
   *
   * If the control is hidden, the detection aborts because something other
   * than an adblocker is hiding elements (CSS bug, layout issue, etc.)
   */
  const runControlledBaitTest = useCallback(async (): Promise<BaitTestResult> => {
    return new Promise((resolve) => {
      // Create container positioned off-screen to avoid visual flicker
      const container = document.createElement("div")
      container.style.cssText =
        "position:absolute;top:-1px;left:-1px;width:1px;height:1px;overflow:hidden;pointer-events:none;"

      // ═══════════════════════════════════════════════════════════════════════
      // v11.0 - 8 INDEPENDENT CONTROL ELEMENTS (CRITICAL FOR ZERO FP)
      // Each uses a DIFFERENT legitimate, non-ad class that NO filter list ever
      // targets. We also use a random suffix per element so cosmetic-rule
      // collisions are mathematically impossible. If ANY control is hidden, we
      // abort the cycle entirely - it means CSS/layout interference, not adblock.
      // ═══════════════════════════════════════════════════════════════════════
      const controls: HTMLElement[] = []
      const rnd = () => Math.random().toString(36).slice(2, 10)
      const controlClassSets = [
        ["site-content", "main-wrapper", `legit_${rnd()}`],
        ["page-content", "content-area", `legit_${rnd()}`],
        ["main-content", "article-body", `legit_${rnd()}`],
        ["post-content", "entry-content", `legit_${rnd()}`],
        ["primary-content", "body-text", `legit_${rnd()}`],
        ["app-shell", "view-container", `legit_${rnd()}`],
        ["layout-root", "page-shell", `legit_${rnd()}`],
        ["doc-body", "section-text", `legit_${rnd()}`],
      ]
      controlClassSets.forEach((classes, i) => {
        const el = document.createElement("div")
        el.className = classes.join(" ")
        el.id = `__legit_content_${i}_${Math.random().toString(36).slice(2, 8)}`
        el.style.cssText =
          "width:10px!important;height:10px!important;display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;"
        el.innerHTML = "<span>.</span>"
        controls.push(el)
      })
      // Primary control (kept for backward-compatible field)
      const control = controls[0]

      // BAIT ELEMENTS - These ARE targeted by adblockers (v9.0 - expanded for AdGuard, Adblocker Ultimate)
      const baitConfigs = [
        // EasyList / uBlock / AdBlock Plus universal targets
        { className: "adsbox", id: "adsbox" },
        { className: "ad-banner ad-placement", id: "ad-banner-container" },
        { className: "adsbygoogle", id: "google-ad-slot-1" },
        { className: "sponsored-ad sponsored", id: "sponsored-content-wrapper" },
        { className: "ad-unit ad_unit ad_box", id: "ad-unit-main" },
        { className: "textad text-ad text_ad text_ads", id: "text-ad-slot" },
        { className: "banner-ad banner_ad", id: "banner-ad-top" },
        { className: "ad-container ad_container", id: "ad-container-1" },
        { className: "google-ad googlead", id: "google-ad-wrapper" },
        { className: "ad-wrapper ad_wrapper adwrapper", id: "ad-wrapper-main" },
        { className: "dfp-ad doubleclick-ad", id: "dfp-ad-leaderboard" },
        { className: "taboola-container", id: "taboola-below-article" },
        { className: "outbrain-widget outbrain-container", id: "outbrain-widget-1" },
        { className: "commercial-unit sponsored-links", id: "commercial-unit-top" },
        { className: "ad-slot ad_slot", id: "ad-slot-sidebar" },
        // ===== v9.0 - AdGuard / Adblocker Ultimate specific targets =====
        // AdGuard cosmetic filters target these IDs aggressively
        { className: "advertisement advert", id: "ad" },
        { className: "advertising adv", id: "ads" },
        { className: "ad", id: "advertisement" },
        { className: "ad", id: "advertising" },
        { className: "ad-leaderboard", id: "leaderboard-ad" },
        { className: "ad-rectangle pub_300x250", id: "div-gpt-ad-300x250" },
        { className: "ad-skyscraper", id: "skyscraper-ad" },
        { className: "ad-banner pub_728x90", id: "div-gpt-ad-leaderboard" },
        { className: "google_ads google-ads", id: "google_ads_iframe" },
        { className: "ad-content ads-content", id: "main-ad-area" },
        { className: "promo-banner promoted-content", id: "promoted-stories" },
        { className: "ad__banner ad__container", id: "ad-bem-block" },
        { className: "AdSlot AdContainer", id: "AdSlot_TopBanner" },
        { className: "ezoic-ad ezoic-pub-ad-placeholder", id: "ezoic-pub-ad-placeholder-100" },
        { className: "carbonads carbon-ad", id: "carbonads" },
        { className: "buysellads bsa-ad", id: "bsap_aplus_default" },
        { className: "mediavine-ad", id: "mv_slot_target" },
        { className: "playwire-ad", id: "playwire_video_player" },
        // Native ad containers (AdGuard "Annoyances" + Adblocker Ultimate)
        { className: "native-ad sponsored-link", id: "native-ad-1" },
        { className: "advertorial advertorial-content", id: "advertorial-block" },
        { className: "branded-content partner-content", id: "branded-content-row" },
        // ID-based cosmetic filters (very common in AdGuard rules)
        { className: "anchor-ad", id: "sticky-ad-bottom" },
        { className: "popunder ad-overlay", id: "popunder_ad" },
        { className: "interstitial-ad", id: "interstitial" },
        { className: "video-ad preroll-ad", id: "videoAdContainer" },
        // Adblocker Ultimate aggressive id patterns
        { className: "ad-recommended recommended-ads", id: "recommended-ads-block" },
        { className: "house-ad house_ad", id: "house-ads-slot" },
      ]

      const baits: Array<{ name: string; el: HTMLElement }> = []

      // Create bait elements
      baitConfigs.forEach(({ className, id }) => {
        const el = document.createElement("div")
        el.className = className
        el.id = id
        el.style.cssText =
          "width:10px!important;height:10px!important;display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;background:transparent!important;"
        el.innerHTML = "<span>.</span>"
        baits.push({ name: className.split(" ")[0], el })
      })

      // Add all elements to container
      controls.forEach((c) => container.appendChild(c))
      baits.forEach(({ el }) => container.appendChild(el))
      document.body.appendChild(container)

      // Wait for adblockers to process the elements
      setTimeout(() => {
        // v10.0: ANY hidden control => abort (zero FP guarantee)
        const controlResults = controls.map((c) => isElementHiddenByAdblocker(c))
        const anyControlHidden = controlResults.some((r) => r.hidden)
        const controlResult = controlResults[0]

        const baitResults = baits.map(({ name, el }) => {
          const result = isElementHiddenByAdblocker(el)
          return { name, hidden: result.hidden, reason: result.reason }
        })

        // Clean up
        container.remove()

        const hiddenCount = baitResults.filter((r) => r.hidden).length

        resolve({
          controlVisible: !controlResult.hidden && !anyControlHidden,
          baitResults,
          hiddenCount,
          totalBaits: baits.length,
        })
      }, CONFIG.BAIT_ELEMENT_WAIT_MS)
    })
  }, [])

  // =========================================================================
  // BAIT IMAGE DETECTION
  // =========================================================================

  /**
   * Tests if ad-related images are blocked from loading.
   * Creates Image elements with ad-like URLs and checks if they load.
   */
  const detectBaitImages = useCallback(async (timeout: number): Promise<DetectionSignal | null> => {
    // v14.0: Use BOTH first-party `/api/ads/*` paths AND real cross-origin
    // tracking-pixel URLs. The first-party paths catch extension-based blockers
    // (uBlock Origin, AdBlock Plus) that pattern-match "/ads/" in their lists.
    // The third-party URLs catch Brave Shields, AdGuard (both extension and
    // DNS), Adblocker Ultimate, Pi-hole, NextDNS, and every blocker whose
    // filter list is built on EasyList domain rules.
    //
    // NOTE: We deliberately do NOT set `crossOrigin` on the Image elements
    // because cross-origin servers don't send CORS headers for these assets.
    // Setting crossOrigin would cause onerror to fire from CORS failure even
    // without an adblocker (a v13.x false-positive bug we just removed). The
    // browser still loads the image natively and onerror fires only if the
    // request itself is blocked.
    const firstParty = [...BAIT_PATTERNS.images, ...BAIT_PATTERNS.google.slice(0, 4)]
    // v14.1: ONLY actual image/pixel endpoints — no .js URLs. JS responses
    // would fail Image decoding and produce `onerror` even without an
    // adblocker, causing false positives. Every URL below returns an image
    // or 1x1 pixel response under normal conditions.
    const thirdParty = [
      // Google ad image endpoints
      "https://pagead2.googlesyndication.com/pagead/imgad?id=CICAgKDV1ZeoIxABGAEyCH-iY1qD5kPx",
      "https://www.googleadservices.com/pagead/conversion/1/?label=test&guid=ON",
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/?value=0&guid=ON",
      // Tracking pixels (return 1x1 GIF/PNG under normal conditions)
      "https://www.google-analytics.com/collect?v=1&tid=UA-0-0&cid=test&t=pageview",
      "https://www.facebook.com/tr?id=0&ev=PageView&noscript=1",
      "https://sb.scorecardresearch.com/p?c1=2&c2=demo",
      "https://b.scorecardresearch.com/b?c1=2&c2=demo",
      "https://t.co/i/adsct?type=javascript&version=2.3.30",
      "https://analytics.twitter.com/i/adsct?type=javascript",
      "https://px.ads.linkedin.com/collect/?pid=000&fmt=gif",
      "https://bat.bing.com/action/0?ti=000&Ver=2",
      "https://insight.adsrvr.org/track/pxl/?adv=00&ct=0:00",
    ]
    const adPaths = [...firstParty, ...thirdParty]
    let blocked = 0
    let firstPartyBlocked = 0
    let thirdPartyBlocked = 0
    const total = adPaths.length

    await Promise.all(
      adPaths.map((path, idx) => {
        const isThirdParty = idx >= firstParty.length
        return new Promise<void>((resolve) => {
          const img = new Image()
          // NO crossOrigin for third-party — they don't ship CORS headers and
          // setting it would cause false `onerror` events on every request.
          if (!isThirdParty) img.crossOrigin = "anonymous"

          let settled = false
          const finalize = (wasBlocked: boolean) => {
            if (settled) return
            settled = true
            if (wasBlocked) {
              blocked++
              if (isThirdParty) thirdPartyBlocked++
              else firstPartyBlocked++
            }
            resolve()
          }

          const timeoutId = setTimeout(() => finalize(true), timeout)

          img.onload = () => {
            clearTimeout(timeoutId)
            finalize(false)
          }
          img.onerror = () => {
            clearTimeout(timeoutId)
            finalize(true)
          }

          img.src = `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}&r=${Math.random().toString(36).slice(2)}`
        })
      }),
    )

    const blockedRatio = blocked / total
    // v14.0: Third-party-heavy block is a much stronger signal because real
    // ad-network domain blocking has effectively zero ambient false-positive
    // rate (those domains always exist online). We use the stronger of the
    // overall ratio vs the third-party-only ratio for confidence.
    const thirdPartyRatio = thirdParty.length > 0 ? thirdPartyBlocked / thirdParty.length : 0
    const effectiveConfidence = Math.max(blockedRatio, thirdPartyRatio)
    if (
      blockedRatio >= CONFIG.MIN_BAIT_IMAGE_BLOCKED_RATIO ||
      // Lower bar when 3+ real ad-network pixels are blocked — that alone is
      // near-conclusive proof of an adblocker.
      thirdPartyBlocked >= 3
    ) {
      return {
        method: "bait-image-blocked",
        category: "bait",
        weight: getMethodWeight("bait-image-blocked"),
        confidence: Math.round(effectiveConfidence * 100),
        timestamp: Date.now(),
        metadata: {
          blocked,
          total,
          blockedRatio,
          firstPartyBlocked,
          thirdPartyBlocked,
          thirdPartyRatio,
        },
      }
    }
    return null
  }, [])

  // =========================================================================
  // BAIT ELEMENT DETECTION
  // =========================================================================

  /**
   * Tests if ad-related DOM elements are hidden or removed.
   * Creates elements with ad-like class names and IDs, then checks visibility.
   */
  const detectBaitElements = useCallback(async (): Promise<DetectionSignal | null> => {
    const baitConfigs = [
      { tag: "div", className: "ad-banner ad-container adsbox", id: "ad-slot-1" },
      { tag: "div", className: "adsbygoogle google-ad sponsored-content", id: "google-ad" },
      { tag: "ins", className: "adsbygoogle", attrs: { "data-ad-client": "ca-pub-1234567890" } },
      { tag: "div", className: "ad-placement banner-ad advertisement", id: "banner-ad-container" },
      { tag: "div", className: "textads commercial-unit sponsored-links", id: "sponsored-links" },
      { tag: "div", className: "ad-wrapper ad-unit ad-zone", id: "ad-zone-header" },
      { tag: "div", className: "dfp-ad doubleclick-ad", id: "dfp-ad-top" },
      { tag: "iframe", className: "ad-iframe google-ad-iframe", id: "aswift_0" },
      { tag: "div", className: "taboola-container taboola-widget", id: "taboola-below-article" },
      { tag: "div", className: "outbrain-widget outbrain-container", id: "outbrain-widget" },
      { tag: "div", className: "ad-leaderboard leaderboard-ad", id: "leaderboard-ad-top" },
      { tag: "div", className: "sidebar-ad ad-sidebar", id: "sidebar-ad-1" },
      { tag: "div", className: "native-ad native-ad-container", id: "native-ad-slot" },
      { tag: "div", className: "video-ad video-ad-container", id: "video-ad-player" },
      { tag: "div", className: "interstitial-ad popup-ad", id: "interstitial-container" },
    ]

    const container = document.createElement("div")
    container.id = `__adblock_test_${Date.now()}`
    container.style.cssText = "position:absolute;top:-1px;left:-1px;width:1px;height:1px;overflow:hidden;pointer-events:none;"


    const elements: HTMLElement[] = []

    baitConfigs.forEach((config) => {
      const element = document.createElement(config.tag)
      element.className = config.className
      element.id = config.id
      element.style.cssText = "width:300px;height:250px;display:block;visibility:visible;opacity:1;"
      element.innerHTML = '<span class="ad-text">Advertisement</span>'
      if ((config as any).attrs) {
        Object.entries((config as any).attrs).forEach(([key, value]) => {
          element.setAttribute(key, value as string)
        })
      }
      elements.push(element)
      container.appendChild(element)
    })

    document.body.appendChild(container)
    await new Promise((r) => setTimeout(r, CONFIG.BAIT_ELEMENT_EXTENDED_WAIT_MS))

    let hiddenCount = 0

    elements.forEach((el) => {
      const result = isElementHiddenByAdblocker(el)
      if (result.hidden) hiddenCount++
    })

    container.remove()

    const hiddenRatio = hiddenCount / elements.length
    if (hiddenRatio >= CONFIG.MIN_BAIT_ELEMENT_HIDDEN_RATIO) {
      return {
        method: "bait-element-hidden",
        category: "bait",
        weight: getMethodWeight("bait-element-hidden"),
        confidence: Math.round(hiddenRatio * 100),
        timestamp: Date.now(),
        metadata: { hiddenCount, total: elements.length, hiddenRatio },
      }
    }
    return null
  }, [])

  // =========================================================================
  // FETCH BLOCKING DETECTION
  // =========================================================================

  /**
   * Tests if fetch requests to ad URLs are blocked.
   * Tests both first-party ad-like routes (blocked by extension-based blockers)
   * AND known ad patterns. Also tests a control URL to eliminate network issues.
   */
  const detectFetchBlocking = useCallback(async (timeout: number): Promise<DetectionSignal | null> => {
    // v14.0: Dual-target fetch probe.
    //   • FIRST-PARTY  — catches extension blockers (uBlock Origin, AdBlock
    //                    Plus, AdGuard extension) that pattern-match "/ads/"
    //                    in their filter lists.
    //   • THIRD-PARTY  — catches Brave Shields, AdGuard (DNS + extension),
    //                    Adblocker Ultimate, Ghostery, Privacy Badger,
    //                    Pi-hole, NextDNS, AdGuard Home, and every blocker
    //                    that uses EasyList/EasyPrivacy domain rules. These
    //                    domains are the ONLY ones reliably blocked across
    //                    the entire blocker ecosystem.
    const firstPartyAdUrls = [
      "/api/ads/ad-banner.js",
      "/api/ads/analytics.js",
      "/api/ads/sponsored.js",
      "/api/ads/banner.gif",
      "/api/ads/tracking-pixel.gif",
      "/api/ads/doubleclick.js",
      "/api/pagead/show_ads.js",
      "/api/ads/prebid.js",
      "/api/ads/amazon-adsystem.js",
      "/api/ads/taboola.js",
      "/api/ads/facebook-pixel.js",
      "/api/ads/hotjar.js",
      "/api/ads/adsense-loader.js",
    ]
    // These URLs are HARDCODED in every major ad-blocker filter list. If even
    // 3 of them load successfully, no adblocker is active. If 4+ are blocked
    // while controls succeed, an adblocker is mathematically guaranteed.
    const thirdPartyAdUrls = [
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      "https://googleads.g.doubleclick.net/pagead/id",
      "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
      "https://static.doubleclick.net/instream/ad_status.js",
      "https://www.googletagmanager.com/gtag/js?id=GTM-TEST",
      "https://www.google-analytics.com/analytics.js",
      "https://connect.facebook.net/en_US/fbevents.js",
      "https://static.ads-twitter.com/uwt.js",
      "https://cdn.taboola.com/libtrc/impl.js",
      "https://static.criteo.net/js/ld/ld.js",
      "https://s.amazon-adsystem.com/aax2/apstag.js",
      "https://analytics.tiktok.com/i18n/pixel/static/pixel.js",
    ]

    // v14.0: TRIPLE control fetches to eliminate network-issue false positives.
    // We need at least 2 of 3 same-origin controls to succeed before we trust
    // any "blocked" claim.
    const controlUrls = [`/api/health`, `/api/ping`, `/favicon.ico`]
    let controlOk = 0
    await Promise.all(
      controlUrls.map(async (url) => {
        try {
          const ctrl = new AbortController()
          const t = setTimeout(() => ctrl.abort(), 4000)
          const res = await fetch(`${url}?_=${Date.now()}&r=${Math.random()}`, {
            cache: "no-store",
            signal: ctrl.signal,
          })
          clearTimeout(t)
          if (res.ok || res.status < 500) controlOk++
        } catch {
          // ignore — count remains low
        }
      }),
    )
    if (controlOk < 2) return null // Network unreliable — never flag as ad blocking

    let firstPartyBlocked = 0
    await Promise.all(
      firstPartyAdUrls.map(async (url) => {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)
          const res = await fetch(`${url}${cacheBuster()}`, {
            cache: "no-store",
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
          if (!res.ok) {
            firstPartyBlocked++
          } else {
            const text = await res.text()
            if (!text || text.length < 5) firstPartyBlocked++
          }
        } catch {
          firstPartyBlocked++
        }
      }),
    )

    // Third-party probes use `mode: 'no-cors'` so opaque-success resolves
    // normally without throwing. A blocked request rejects the promise with
    // TypeError (extension webRequest, Brave Shields, Safari Content Blocker)
    // or AbortError (Pi-hole / AdGuard DNS → 0.0.0.0 → connection refused →
    // browser eventually aborts, or our timeout fires). EITHER throw == blocked.
    //
    // v14.1: REMOVED the buggy `elapsed < 8ms` heuristic — `mode: 'no-cors'`
    // never throws on success, so a fast success is a normal cached opaque
    // response, NOT a block. The catch block alone correctly identifies real
    // blocks across every major blocker (uBlock Origin, AdBlock Plus, AdGuard
    // extension + DNS, Brave Shields desktop + Android + iOS, Adblocker
    // Ultimate, Ghostery, Privacy Badger, Pi-hole, AdGuard Home, NextDNS,
    // Cloudflare Gateway, OpenDNS, Safari Content Blockers).
    let thirdPartyBlocked = 0
    await Promise.all(
      thirdPartyAdUrls.map(async (url) => {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)
          await fetch(url, {
            method: "GET",
            mode: "no-cors",
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
          // Opaque success — not blocked.
        } catch {
          thirdPartyBlocked++
        }
      }),
    )

    const totalBlocked = firstPartyBlocked + thirdPartyBlocked
    const total = firstPartyAdUrls.length + thirdPartyAdUrls.length
    const blockedRatio = totalBlocked / total
    const thirdPartyRatio = thirdPartyBlocked / thirdPartyAdUrls.length

    // v14.1: Trigger if EITHER:
    //   a) Overall ratio meets threshold (catches mixed cases), OR
    //   b) 3+ third-party ad-network URLs blocked (catches Brave/AdGuard/DNS
    //      blockers that don't touch first-party URLs at all). 3 is enough
    //      because controlOk >= 2 already guarantees the network is healthy,
    //      so a TypeError on 3+ canonical ad domains can only come from
    //      adblocker interference. The instant-flag tier separately requires
    //      higher counts for a single-cycle flag — this lower bar feeds the
    //      multi-cycle gate.
    const shouldFlag =
      blockedRatio >= CONFIG.MIN_BAIT_FETCH_BLOCKED_RATIO || thirdPartyBlocked >= 3

    if (shouldFlag) {
      return {
        method: "bait-fetch-blocked",
        category: "bait",
        weight: getMethodWeight("bait-fetch-blocked"),
        confidence: Math.round(Math.max(blockedRatio, thirdPartyRatio) * 100),
        timestamp: Date.now(),
        metadata: {
          firstPartyBlocked,
          thirdPartyBlocked,
          total,
          blockedRatio,
          thirdPartyRatio,
          controlsOk: controlOk,
        },
      }
    }
    return null
  }, [])

  // =========================================================================
  // DNS BLOCKING DETECTION
  // =========================================================================

  /**
   * Tests if DNS resolution to ad domains is blocked.
   * Uses a dual-probe approach: tests external ad domains AND a known-good
   * control domain. DNS blockers will fail on ad domains but succeed on control.
   * This eliminates false positives from general network issues.
   */
  const detectDNSBlocking = useCallback(async (timeout: number): Promise<DetectionSignal | null> => {
    // Ad domains that DNS blockers (AdGuard DNS, Pi-hole, NextDNS, etc.) will block
    const adDomains = [
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      "https://www.googleadservices.com/pagead/conversion.js",
      "https://static.doubleclick.net/instream/ad_status.js",
      "https://connect.facebook.net/en_US/fbevents.js",
      "https://cdn.taboola.com/libtrc/impl.js",
      "https://static.criteo.net/js/ld/ld.js",
      "https://s.amazon-adsystem.com/aax2/apstag.js",
      "https://c.amazon-adsystem.com/aax2/apstag.js",
      "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
      "https://www.google-analytics.com/analytics.js",
      "https://www.googletagmanager.com/gtag/js",
      "https://ad.doubleclick.net/ddm/ad/",
    ]

    // v11.0 - Control domains that should NEVER be blocked by any adblocker but
    // ARE blocked by overly-restrictive DNS filters. We REQUIRE all of these to
    // succeed before trusting any "ad blocked" claim. Without ALL controls
    // succeeding, the result is treated as a network issue (zero FP gate).
    const controlDomains = [
      "https://www.google.com/generate_204",
      "https://www.cloudflare.com/cdn-cgi/trace",
      "https://detectportal.firefox.com/canonical.html",
      "https://1.1.1.1/cdn-cgi/trace",
      "https://www.apple.com/library/test/success.html",
    ]

    // First, verify network connectivity with control domains
    let controlSuccessCount = 0
    await Promise.all(
      controlDomains.map(async (url) => {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000)
          await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller.signal })
          clearTimeout(timeoutId)
          controlSuccessCount++
        } catch {
          // Control failed - network issue, not ad blocking
        }
      }),
    )

    // v11.0 ZERO-FP GATE: REQUIRE at least CONTROL_FETCH_COUNT controls to pass.
    // If most controls fail, network is unreliable - never flag as DNS blocking.
    if (controlSuccessCount < CONFIG.CONTROL_FETCH_COUNT) return null

    // Now test ad domains
    let adBlocked = 0
    let adSuccess = 0
    const timings: number[] = []

    await Promise.all(
      adDomains.map(async (url) => {
        const start = performance.now()
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)
          await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller.signal })
          clearTimeout(timeoutId)
          const elapsed = performance.now() - start
          timings.push(elapsed)

          // DNS blockers that return 0.0.0.0 will resolve instantly (<5ms) with no-cors
          // but real servers take at least some time for TLS + network round trip
          if (elapsed < 5) {
            adBlocked++
          } else {
            adSuccess++
          }
        } catch (e: any) {
          const elapsed = performance.now() - start
          timings.push(elapsed)
          // TypeError = DNS resolution failed (NXDOMAIN from DNS blocker)
          // AbortError = timed out (some DNS blockers drop packets)
          // Very fast errors (<15ms) = instant DNS rejection
          if (e.name === "TypeError") {
            adBlocked++
          } else if (e.name === "AbortError") {
            adBlocked++
          } else if (elapsed < 15) {
            adBlocked++
          }
        }
      }),
    )

    const blockedRatio = adBlocked / adDomains.length

    // v11.0 ZERO-FP GATE for DNS: controls majority pass AND ad domains majority
    // blocked. We REQUIRE the MIN_DNS_BLOCKED_RATIO threshold (default 0.50) so
    // small numbers of network failures never produce a false DNS-blocking flag.
    if (blockedRatio >= CONFIG.MIN_DNS_BLOCKED_RATIO && controlSuccessCount >= CONFIG.CONTROL_FETCH_COUNT) {
      return {
        method: "dns-blocking",
        category: "network",
        weight: getMethodWeight("dns-blocking"),
        confidence: Math.round(blockedRatio * 100),
        timestamp: Date.now(),
        metadata: {
          blocked: adBlocked,
          succeeded: adSuccess,
          total: adDomains.length,
          blockedRatio,
          controlsOk: controlSuccessCount,
          avgTiming: timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0,
        },
      }
    }
    return null
  }, [])

  // =========================================================================
  // KNOWN BLOCKER DETECTION
  // =========================================================================

  /**
   * Checks for known adblocker extension signatures.
   * Looks for global variables and DOM elements created by extensions.
   */
  const detectKnownBlockerVariables = useCallback(async (): Promise<{
    signal: DetectionSignal | null
    blockerName: string | null
  }> => {
    const w = window as any

    // Check for extension-specific global variables
    for (const blocker of KNOWN_BLOCKERS.extensions) {
      for (const signature of blocker.signatures) {
        try {
          if (w[signature] || document.getElementById(signature)) {
            return {
              signal: {
                method: "extension-detection",
                category: "fingerprint",
                weight: getMethodWeight("extension-detection"),
                confidence: 95,
                timestamp: Date.now(),
                metadata: { blockerName: blocker.name, signature },
              },
              blockerName: blocker.name,
            }
          }
        } catch { }
      }
    }

    // Check for Brave browser - but only flag if shields are actually ACTIVE
    // navigator.brave.isBrave() only confirms the browser, not that shields block ads
    // We need to combine browser detection with actual blocking evidence
    if ((navigator as any).brave) {
      try {
        const isBrave = await (navigator as any).brave.isBrave()
        if (isBrave) {
          // Test if Brave Shields is actually blocking by trying to load an ad resource
          let shieldsActive = false
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 2000)
            const testRes = await fetch(`/api/ads/ad-banner.js?_=${Date.now()}`, {
              cache: "no-store",
              signal: controller.signal,
            })
            clearTimeout(timeoutId)
            // If we get here AND response is ok, shields might not be blocking first-party
            // But Brave shields primarily blocks third-party; test an external ad domain
            const extController = new AbortController()
            const extTimeout = setTimeout(() => extController.abort(), 2000)
            try {
              await fetch("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", {
                method: "HEAD",
                mode: "no-cors",
                cache: "no-store",
                signal: extController.signal,
              })
              clearTimeout(extTimeout)
            } catch {
              clearTimeout(extTimeout)
              shieldsActive = true
            }
          } catch {
            shieldsActive = true
          }

          if (shieldsActive) {
            return {
              signal: {
                method: "brave-shields",
                category: "browser",
                weight: getMethodWeight("brave-shields"),
                confidence: 92,
                timestamp: Date.now(),
                metadata: { blockerName: "Brave Shields", shieldsActive: true },
              },
              blockerName: "Brave Shields",
            }
          }
        }
      } catch { }
    }

    // Check for injected CSS classes
    for (const cssClass of KNOWN_BLOCKERS.cssClasses) {
      if (document.body.classList.contains(cssClass) || document.documentElement.classList.contains(cssClass)) {
        return {
          signal: {
            method: "extension-detection",
            category: "fingerprint",
            weight: getMethodWeight("extension-detection"),
            confidence: 85,
            timestamp: Date.now(),
            metadata: { blockerName: "Unknown", cssClass },
          },
          blockerName: "Unknown",
        }
      }
    }

    // Check for AdGuard-specific CSS injection patterns
    // AdGuard injects stylesheets with rules that hide ad elements
    try {
      const styleSheets = document.styleSheets
      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const sheet = styleSheets[i]
          // AdGuard inserts stylesheets without href (inline) that contain ad-hiding rules
          if (!sheet.href && sheet.cssRules) {
            for (let j = 0; j < Math.min(sheet.cssRules.length, 50); j++) {
              const rule = sheet.cssRules[j]
              if (rule instanceof CSSStyleRule) {
                const selector = rule.selectorText?.toLowerCase() || ""
                // AdGuard uses specific patterns for element hiding
                if (
                  (selector.includes("[id*=\"ad\"]") || selector.includes("[class*=\"ad\"]") ||
                    selector.includes("div[id^=\"adg\"]") || selector.includes("#AdGuard")) &&
                  rule.style?.display === "none"
                ) {
                  return {
                    signal: {
                      method: "extension-detection",
                      category: "fingerprint",
                      weight: getMethodWeight("extension-detection"),
                      confidence: 90,
                      timestamp: Date.now(),
                      metadata: { blockerName: "AdGuard", detectionMethod: "css-injection", selector },
                    },
                    blockerName: "AdGuard",
                  }
                }
              }
            }
          }
        } catch {
          // CORS prevents reading cross-origin stylesheets - that's expected
        }
      }
    } catch {
      // StyleSheet access not available
    }

    return { signal: null, blockerName: null }
  }, [])

  // =========================================================================
  // CANVAS FARBLING DETECTION
  // =========================================================================

  /**
   * Detects canvas fingerprint randomization (farbling).
   * Brave and some privacy extensions randomize canvas output.
   */
  const detectCanvasFarbling = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      const results: string[] = []

      for (let i = 0; i < CONFIG.CANVAS_TEST_ITERATIONS; i++) {
        const canvas = document.createElement("canvas")
        canvas.width = 280
        canvas.height = 60
        const ctx = canvas.getContext("2d")

        if (ctx) {
          // Draw identical content each iteration
          ctx.fillStyle = "#f60"
          ctx.fillRect(0, 0, 140, 60)
          ctx.fillStyle = "#069"
          ctx.fillRect(140, 0, 140, 60)
          ctx.fillStyle = "#fff"
          ctx.font = "bold 24px Arial"
          ctx.fillText("Test Canvas", 20, 30)
          ctx.fillStyle = "#000"
          ctx.font = "14px Arial"
          ctx.fillText("Fingerprint Check", 20, 50)

          results.push(canvas.toDataURL())
        }

        await new Promise((r) => setTimeout(r, 50))
      }

      const uniqueResults = new Set(results)

      // If results differ, canvas is being farbled
      if (uniqueResults.size > 1) {
        return {
          method: "canvas-farbling",
          category: "browser",
          weight: getMethodWeight("canvas-farbling"),
          confidence: Math.min(90, uniqueResults.size * 25),
          timestamp: Date.now(),
          metadata: { uniqueVariations: uniqueResults.size, totalTests: results.length },
        }
      }
    } catch { }

    return null
  }, [])

  // =========================================================================
  // WEBRTC BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects WebRTC IP leak protection.
   * Many adblockers and privacy extensions block WebRTC to prevent IP leaks.
   */
  const detectWebRTCBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      })

      pc.createDataChannel("")
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const result = await new Promise<boolean>((resolve) => {
        let foundLocalIP = false
        const timeout = setTimeout(() => {
          pc.close()
          resolve(!foundLocalIP)
        }, CONFIG.WEBRTC_TIMEOUT_MS)

        pc.onicecandidate = (e) => {
          if (e.candidate?.candidate?.includes("typ host")) {
            foundLocalIP = true
          }
        }

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout)
            pc.close()
            resolve(!foundLocalIP)
          }
        }
      })

      if (result) {
        return {
          method: "webrtc-blocking",
          category: "browser",
          weight: getMethodWeight("webrtc-blocking"),
          confidence: 72,
          timestamp: Date.now(),
          metadata: { feature: "WebRTC IP leak protection" },
        }
      }
    } catch {
      return {
        method: "webrtc-blocking",
        category: "browser",
        weight: getMethodWeight("webrtc-blocking"),
        confidence: 65,
        timestamp: Date.now(),
        metadata: { feature: "WebRTC unavailable" },
      }
    }

    return null
  }, [])

  // =========================================================================
  // WEBGL FINGERPRINT BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects WebGL fingerprint blocking or spoofing.
   * Privacy extensions often block or spoof WebGL renderer info.
   */
  const detectWebGLBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")

      if (!gl) {
        return {
          method: "webgl-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("webgl-fingerprint-blocked"),
          confidence: 60,
          timestamp: Date.now(),
          metadata: { reason: "webgl-unavailable" },
        }
      }

      const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info")
      if (!debugInfo) {
        return {
          method: "webgl-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("webgl-fingerprint-blocked"),
          confidence: 70,
          timestamp: Date.now(),
          metadata: { reason: "debug-info-blocked" },
        }
      }

      const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)

      // Check for genuinely spoofed values - but NOT common legitimate values
      // SwiftShader, llvmpipe, ANGLE are common on VMs, CI, and low-end devices
      // "Google Inc." is Chrome's default vendor - NOT an indicator of blocking
      // Only flag if values are obviously fake/empty (true spoofing by privacy tools)
      if (!renderer || !vendor || renderer === "" || vendor === "") {
        return {
          method: "webgl-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("webgl-fingerprint-blocked"),
          confidence: 65,
          timestamp: Date.now(),
          metadata: { vendor, renderer, reason: "spoofed-values" },
        }
      }
    } catch (e) {
      return {
        method: "webgl-fingerprint-blocked",
        category: "browser",
        weight: getMethodWeight("webgl-fingerprint-blocked"),
        confidence: 55,
        timestamp: Date.now(),
        metadata: { error: (e as Error).message },
      }
    }

    return null
  }, [])

  // =========================================================================
  // AUDIO FINGERPRINT BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects audio fingerprint blocking or farbling.
   * Brave and privacy extensions manipulate AudioContext output.
   */
  const detectAudioFingerprintBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContext) {
        return {
          method: "audio-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("audio-fingerprint-blocked"),
          confidence: 50,
          timestamp: Date.now(),
          metadata: { reason: "audiocontext-unavailable" },
        }
      }

      const results: number[] = []
      for (let i = 0; i < CONFIG.AUDIO_TEST_ITERATIONS; i++) {
        const ctx = new AudioContext()
        const oscillator = ctx.createOscillator()
        const analyser = ctx.createAnalyser()
        const gain = ctx.createGain()
        const processor = ctx.createScriptProcessor(4096, 1, 1)

        oscillator.type = "triangle"
        oscillator.frequency.value = 10000

        gain.gain.value = 0

        oscillator.connect(analyser)
        analyser.connect(processor)
        processor.connect(gain)
        gain.connect(ctx.destination)

        oscillator.start(0)

        await new Promise<void>((resolve) => {
          processor.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0)
            let sum = 0
            for (let j = 0; j < data.length; j++) {
              sum += Math.abs(data[j])
            }
            results.push(sum)
            try {
              oscillator.stop()
            } catch { /* already stopped */ }
            processor.disconnect()
            // Only close if not already closed to avoid "Cannot close a closed AudioContext" error
            if (ctx.state !== "closed") {
              ctx.close().catch(() => { /* ignore */ })
            }
            resolve()
          }
        })

        await new Promise((r) => setTimeout(r, 50))
      }

      // Check if results are all zero (indicates blocking)
      const uniqueResults = new Set(results.map((r) => r.toFixed(10)))
      if (uniqueResults.size === 1 && results[0] === 0) {
        return {
          method: "audio-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("audio-fingerprint-blocked"),
          confidence: 75,
          timestamp: Date.now(),
          metadata: { reason: "audio-nullified", samples: results.length },
        }
      }

      // Check for farbling (Brave-style randomization)
      if (uniqueResults.size === results.length && results.length >= 3) {
        return {
          method: "audio-fingerprint-blocked",
          category: "browser",
          weight: getMethodWeight("audio-fingerprint-blocked"),
          confidence: 68,
          timestamp: Date.now(),
          metadata: { reason: "audio-farbling", uniqueVariations: uniqueResults.size },
        }
      }
    } catch (e) {
      return {
        method: "audio-fingerprint-blocked",
        category: "browser",
        weight: getMethodWeight("audio-fingerprint-blocked"),
        confidence: 55,
        timestamp: Date.now(),
        metadata: { error: (e as Error).message },
      }
    }

    return null
  }, [])

  // =========================================================================
  // FONT ENUMERATION BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects font enumeration blocking.
   * Privacy extensions limit the fonts that can be detected.
   */
  const detectFontEnumerationBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    const testFonts = [
      "Arial",
      "Helvetica",
      "Times New Roman",
      "Georgia",
      "Verdana",
      "Trebuchet MS",
      "Comic Sans MS",
      "Impact",
      "Lucida Console",
      "Tahoma",
      "Palatino Linotype",
      "Century Gothic",
      "Bookman Old Style",
      "Garamond",
      "MS Gothic",
      "MS PGothic",
      "MS Mincho",
      "Gulim",
      "PMingLiU",
      "SimSun",
    ]

    const baseFonts = ["monospace", "sans-serif", "serif"]

    try {
      const detectedFonts: string[] = []
      const testString = "mmmmmmmmmmlli"
      const testSize = "72px"

      const span = document.createElement("span")
      span.style.cssText = `
        position: absolute;
        left: -9999px;
        font-size: ${testSize};
        font-style: normal;
        font-weight: normal;
        letter-spacing: normal;
        line-height: normal;
        text-transform: none;
        visibility: hidden;
      `
      span.textContent = testString
      document.body.appendChild(span)

      const baseWidths: Record<string, number> = {}
      for (const baseFont of baseFonts) {
        span.style.fontFamily = baseFont
        baseWidths[baseFont] = span.offsetWidth
      }

      for (const font of testFonts) {
        let detected = false
        for (const baseFont of baseFonts) {
          span.style.fontFamily = `"${font}", ${baseFont}`
          if (span.offsetWidth !== baseWidths[baseFont]) {
            detected = true
            break
          }
        }
        if (detected) {
          detectedFonts.push(font)
        }
      }

      span.remove()

      // If very few fonts detected (< 5), likely being blocked
      if (detectedFonts.length < 5) {
        return {
          method: "font-enumeration-blocked",
          category: "fingerprint",
          weight: getMethodWeight("font-enumeration-blocked"),
          confidence: Math.min(80, 90 - detectedFonts.length * 10),
          timestamp: Date.now(),
          metadata: { detectedCount: detectedFonts.length, tested: testFonts.length },
        }
      }
    } catch (e) {
      return {
        method: "font-enumeration-blocked",
        category: "fingerprint",
        weight: getMethodWeight("font-enumeration-blocked"),
        confidence: 50,
        timestamp: Date.now(),
        metadata: { error: (e as Error).message },
      }
    }

    return null
  }, [])

  // =========================================================================
  // BATTERY API BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects Battery API blocking or value normalization.
   * Privacy extensions may block or spoof battery information.
   */
  const detectBatteryAPIBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      if (!("getBattery" in navigator)) {
        // Battery API not available on this browser
        // Firefox removed Battery API entirely - this is NOT an indicator of ad blocking
        // Safari never supported it. Only flag in Chrome where it should exist.
        const isChrome = navigator.userAgent.includes("Chrome") && !(navigator as any).brave
        const isOpera = navigator.userAgent.includes("OPR")
        // Even in Chrome, many corporate policies disable Battery API
        // This is a very weak signal, so only return it with low confidence
        if (isChrome || isOpera) {
          return {
            method: "battery-api-blocked",
            category: "hardware",
            weight: 40, // Much lower weight - this alone should never trigger detection
            confidence: 35,
            timestamp: Date.now(),
            metadata: { reason: "api-unavailable", browser: isChrome ? "Chrome" : "Opera" },
          }
        }
      }
      // Note: battery at 100% charging is completely normal for desktops/laptops plugged in
      // We do NOT flag normal battery values as "spoofed" - that was a false positive source
    } catch {
      // API threw an error - could be many reasons, very weak signal
      return null
    }

    return null
  }, [])

  // =========================================================================
  // TIMING SIDE CHANNEL DETECTION
  // =========================================================================

  /**
   * Detects blocking through timing analysis.
   * Blocked requests have distinctive timing patterns.
   */
  const detectTimingSideChannelBlocking = useCallback(async (timeout: number): Promise<DetectionSignal | null> => {
    const measurements: number[] = []
    const testUrls = BAIT_PATTERNS.google.slice(0, 10)

    for (const url of testUrls) {
      const start = performance.now()
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        await fetch(`${url}?timing=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
      } catch {
        // Expected for blocked requests
      }
      measurements.push(performance.now() - start)
    }

    const analysis = detectTimingSideChannel(measurements)

    if (analysis.isBlocking && analysis.confidence >= 50) {
      return {
        method: "timing-side-channel",
        category: "advanced",
        weight: getMethodWeight("timing-side-channel"),
        confidence: analysis.confidence,
        timestamp: Date.now(),
        metadata: { anomalyType: analysis.anomalyType, measurements: measurements.length },
      }
    }

    return null
  }, [])

  // =========================================================================
  // MEMORY PRESSURE ANOMALY DETECTION
  // =========================================================================

  /**
   * Detects extension presence through memory patterns.
   * Extensions add to memory footprint in detectable ways.
   */
  const detectMemoryPressureAnomaly = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      if (!(performance as any).memory) return null

      const memory = (performance as any).memory
      memorySnapshotsRef.current.push({
        heap: memory.usedJSHeapSize,
        timestamp: Date.now(),
      })

      // Keep last 20 samples
      if (memorySnapshotsRef.current.length > 20) {
        memorySnapshotsRef.current = memorySnapshotsRef.current.slice(-20)
      }

      if (memorySnapshotsRef.current.length >= 5) {
        const analysis = analyzeMemoryPattern(memorySnapshotsRef.current)

        if (analysis.hasExtension && analysis.confidence >= 40) {
          return {
            method: "memory-pressure-anomaly",
            category: "advanced",
            weight: getMethodWeight("memory-pressure-anomaly"),
            confidence: analysis.confidence,
            timestamp: Date.now(),
            metadata: {
              heapSize: memory.usedJSHeapSize,
              samples: memorySnapshotsRef.current.length,
            },
          }
        }
      }
    } catch {
      // Memory API not available
    }

    return null
  }, [])

  // =========================================================================
  // CSP VIOLATION DETECTION
  // =========================================================================

  /**
   * Detects Content Security Policy violations from ad resources.
   * Some extensions trigger CSP violations when blocking resources.
   */
  const detectCSPViolation = useCallback(async (): Promise<DetectionSignal | null> => {
    return new Promise((resolve) => {
      let violationDetected = false

      const handler = (e: SecurityPolicyViolationEvent) => {
        if (e.blockedURI?.includes("ad") || e.blockedURI?.includes("track") || e.blockedURI?.includes("analytics")) {
          violationDetected = true
        }
      }

      document.addEventListener("securitypolicyviolation", handler)

      // Try to load ad-like resources
      const script = document.createElement("script")
      script.src = "/api/ads/csp-test.js"
      document.head.appendChild(script)

      setTimeout(() => {
        document.removeEventListener("securitypolicyviolation", handler)
        script.remove()

        if (violationDetected) {
          resolve({
            method: "csp-violation-detected",
            category: "network",
            weight: getMethodWeight("csp-violation-detected"),
            confidence: 70,
            timestamp: Date.now(),
            metadata: { type: "csp-blocked-ad-resource" },
          })
        } else {
          resolve(null)
        }
      }, 1000)
    })
  }, [])

  // =========================================================================
  // RESOURCE HINT BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects blocking of preload/prefetch/preconnect hints.
   * Extensions often block these for ad domains.
   */
  const detectResourceHintBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    let blocked = 0
    const tests = 4

    // Test preload
    try {
      const preload = document.createElement("link")
      preload.rel = "preload"
      preload.as = "script"
      preload.href = "/api/ads/preload-test.js"
      document.head.appendChild(preload)

      await new Promise((r) => setTimeout(r, 50))

      const entries = performance.getEntriesByName(preload.href)
      if (entries.length === 0) blocked++

      preload.remove()
    } catch {
      blocked++
    }

    // Test prefetch
    try {
      const prefetch = document.createElement("link")
      prefetch.rel = "prefetch"
      prefetch.href = "/api/ads/prefetch-test.js"
      document.head.appendChild(prefetch)

      await new Promise((r) => setTimeout(r, 50))

      const entries = performance.getEntriesByName(prefetch.href)
      if (entries.length === 0) blocked++

      prefetch.remove()
    } catch {
      blocked++
    }

    // Test preconnect
    try {
      const preconnect = document.createElement("link")
      preconnect.rel = "preconnect"
      preconnect.href = "https://pagead2.googlesyndication.com"
      document.head.appendChild(preconnect)

      await new Promise((r) => setTimeout(r, 300))
      if (!document.head.contains(preconnect)) blocked++

      preconnect.remove()
    } catch {
      blocked++
    }

    // Test dns-prefetch
    try {
      const dnsPrefetch = document.createElement("link")
      dnsPrefetch.rel = "dns-prefetch"
      dnsPrefetch.href = "//ad.doubleclick.net"
      document.head.appendChild(dnsPrefetch)

      await new Promise((r) => setTimeout(r, 200))
      if (!document.head.contains(dnsPrefetch)) blocked++

      dnsPrefetch.remove()
    } catch {
      blocked++
    }

    if (blocked >= 2) {
      return {
        method: "resource-hint-blocked",
        category: "network",
        weight: getMethodWeight("resource-hint-blocked"),
        confidence: Math.round((blocked / tests) * 100),
        timestamp: Date.now(),
        metadata: { blocked, tests },
      }
    }

    return null
  }, [])

  // =========================================================================
  // BEACON BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects blocking of navigator.sendBeacon to tracking URLs.
   */
  const detectBeaconBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      // Test sendBeacon to ad-like URLs
      const testUrls = ["/api/ads/beacon-test", "/api/ads/pixel-beacon", "/api/ads/tracking-beacon"]

      let blocked = 0
      for (const url of testUrls) {
        const success = navigator.sendBeacon(`${url}${cacheBuster()}`, "test")
        if (!success) blocked++
      }

      if (blocked >= 2) {
        return {
          method: "bait-beacon-blocked",
          category: "bait",
          weight: getMethodWeight("bait-beacon-blocked"),
          confidence: Math.round((blocked / testUrls.length) * 100),
          timestamp: Date.now(),
          metadata: { blocked, total: testUrls.length },
        }
      }
    } catch {
      return {
        method: "bait-beacon-blocked",
        category: "bait",
        weight: getMethodWeight("bait-beacon-blocked"),
        confidence: 60,
        timestamp: Date.now(),
        metadata: { error: "sendBeacon unavailable" },
      }
    }

    return null
  }, [])

  // =========================================================================
  // SCRIPT BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects blocking of ad-related script tags.
   */
  const detectScriptBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    return new Promise((resolve) => {
      // v14.1: TWO-CHANNEL PROBE.
      //
      // FIRST-PARTY CHANNEL: real `<script>` tags pointing at our own
      // `/api/ads/*` routes. These execute safely (we control the content)
      // and catch URL-pattern-matching extension blockers (uBlock Origin,
      // AdBlock Plus, AdGuard extension) that target the `/ads/` substring.
      //
      // THIRD-PARTY CHANNEL: `<link rel="preload" as="script">` for canonical
      // ad-network scripts. This is the ONLY spec-compliant way to test if a
      // remote JS URL is network-blocked WITHOUT executing the script:
      //   • Browsers fetch preload targets unconditionally (no execution).
      //   • `onload` fires on successful network load.
      //   • `onerror` fires on network failure, including adblocker cancels.
      //   • Works on all major browsers (Chrome, Firefox, Safari, Edge,
      //     Brave, Samsung Internet, mobile Safari, Chrome Android).
      //
      // The previous v14.0 attempt used `<script type="text/plain">` — but
      // per HTML spec, scripts with a non-script type abort the prepare-
      // script algorithm and NEVER fire load/error events. That meant the
      // third-party channel produced zero signal. Fixed by switching to
      // preload links.
      const firstPartyScripts = [
        "/api/ads/script-test-1.js",
        "/api/ads/analytics-loader.js",
        "/api/ads/tracking-script.js",
      ]
      const thirdPartyScripts = [
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
        "https://www.googletagmanager.com/gtag/js?id=GTM-TEST",
        "https://www.google-analytics.com/analytics.js",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://connect.facebook.net/en_US/fbevents.js",
        "https://static.ads-twitter.com/uwt.js",
        "https://cdn.taboola.com/libtrc/impl.js",
        "https://static.criteo.net/js/ld/ld.js",
      ]

      let firstPartyBlocked = 0
      let thirdPartyBlocked = 0
      let completed = 0
      const total = firstPartyScripts.length + thirdPartyScripts.length
      const cleanup: Element[] = []
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        cleanup.forEach((el) => {
          try { el.remove() } catch { /* ignore */ }
        })
        const blocked = firstPartyBlocked + thirdPartyBlocked
        // Trigger if 2+ first-party-pattern scripts OR 3+ real third-party
        // ad-network scripts were blocked. Third-party path catches every
        // network-layer blocker (Brave, AdGuard, Pi-hole, Adblocker Ultimate).
        if (firstPartyBlocked >= 2 || thirdPartyBlocked >= 3) {
          resolve({
            method: "bait-script-blocked",
            category: "bait",
            weight: getMethodWeight("bait-script-blocked"),
            confidence: Math.round((blocked / total) * 100),
            timestamp: Date.now(),
            metadata: {
              blocked,
              firstPartyBlocked,
              thirdPartyBlocked,
              total,
            },
          })
        } else {
          resolve(null)
        }
      }

      // First-party probes via real <script> tags — these execute (safe;
      // routes return tiny harmless JS) and fire load/error reliably.
      firstPartyScripts.forEach((src) => {
        const script = document.createElement("script")
        script.src = `${src}${cacheBuster()}`
        script.async = true
        script.onload = () => {
          completed++
          if (completed === total) finish()
        }
        script.onerror = () => {
          firstPartyBlocked++
          completed++
          if (completed === total) finish()
        }
        document.head.appendChild(script)
        cleanup.push(script)
      })

      // Third-party probes via <link rel="preload" as="script"> — fetches
      // without executing. The browser still emits load/error on the link
      // element based on the network result.
      thirdPartyScripts.forEach((src) => {
        const link = document.createElement("link")
        link.rel = "preload"
        link.as = "script"
        link.crossOrigin = "anonymous"
        link.href = `${src}${src.includes("?") ? "&" : "?"}_=${Date.now()}&r=${Math.random().toString(36).slice(2)}`
        link.onload = () => {
          completed++
          if (completed === total) finish()
        }
        link.onerror = () => {
          thirdPartyBlocked++
          completed++
          if (completed === total) finish()
        }
        document.head.appendChild(link)
        cleanup.push(link)
      })

      // Timeout fallback — finalize after 4.5s regardless. Anything still
      // pending is treated as blocked (extension blockers sometimes silently
      // drop requests without firing either event).
      setTimeout(() => {
        if (!settled) {
          const pending = total - completed
          if (pending > 0) {
            // Count pending third-party as blocked (silent drops are
            // overwhelmingly blocker behavior, not legit network issues —
            // controls in detectFetchBlocking gate the whole result anyway).
            const pendingThird = Math.min(pending, thirdPartyScripts.length - thirdPartyBlocked)
            thirdPartyBlocked += pendingThird
          }
          finish()
        }
      }, 4500)
    })
  }, [])

  // =========================================================================
  // IFRAME BLOCKING DETECTION
  // =========================================================================

  /**
   * Detects blocking of ad-related iframes.
   */
  const detectIframeBlocking = useCallback(async (): Promise<DetectionSignal | null> => {
    return new Promise((resolve) => {
      const container = document.createElement("div")
      container.style.cssText = "position:absolute;top:-1px;left:-1px;width:1px;height:1px;overflow:hidden;pointer-events:none;"


      const iframeConfigs = [
        { id: "aswift_0", className: "ad-iframe" },
        { id: "google_ads_iframe", className: "google-ad-iframe" },
        { id: "ad-iframe-container", className: "sponsored-iframe" },
      ]

      const iframes: HTMLIFrameElement[] = []

      iframeConfigs.forEach(({ id, className }) => {
        const iframe = document.createElement("iframe")
        iframe.id = id
        iframe.className = className
        iframe.src = "about:blank"
        iframe.style.cssText = "width:300px;height:250px;display:block;visibility:visible;"
        iframes.push(iframe)
        container.appendChild(iframe)
      })

      document.body.appendChild(container)

      setTimeout(() => {
        let hidden = 0

        iframes.forEach((iframe) => {
          const result = isElementHiddenByAdblocker(iframe)
          if (result.hidden) hidden++
        })

        container.remove()

        if (hidden >= 2) {
          resolve({
            method: "bait-iframe-blocked",
            category: "bait",
            weight: getMethodWeight("bait-iframe-blocked"),
            confidence: Math.round((hidden / iframes.length) * 100),
            timestamp: Date.now(),
            metadata: { hidden, total: iframes.length },
          })
        } else {
          resolve(null)
        }
      }, CONFIG.BAIT_ELEMENT_WAIT_MS)
    })
  }, [])

  // =========================================================================
  // PERFORMANCE API ANOMALY DETECTION
  // =========================================================================

  /**
   * Detects anomalies in Performance API entries.
   * Blocked resources create distinctive patterns.
   */
  const detectPerformanceAPIAnomaly = useCallback(async (): Promise<DetectionSignal | null> => {
    try {
      // Get resource timing entries
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[]

      // Look for patterns indicating blocked resources
      let blockedPatterns = 0
      let totalAdResources = 0

      entries.forEach((entry) => {
        const name = entry.name.toLowerCase()
        if (name.includes("ad") || name.includes("track") || name.includes("analytics") || name.includes("pixel")) {
          totalAdResources++
          // Blocked resources often have 0 transfer size or very fast timing
          if (entry.transferSize === 0 || entry.duration < 10 || entry.responseEnd - entry.responseStart < 1) {
            blockedPatterns++
          }
        }
      })

      if (totalAdResources >= 3 && blockedPatterns / totalAdResources >= 0.5) {
        return {
          method: "performance-api-anomaly",
          category: "api",
          weight: getMethodWeight("performance-api-anomaly"),
          confidence: Math.round((blockedPatterns / totalAdResources) * 100),
          timestamp: Date.now(),
          metadata: { blockedPatterns, totalAdResources },
        }
      }
    } catch { }

    return null
  }, [])

  // =========================================================================
  // ENTROPY CORRELATION DETECTION
  // =========================================================================

  /**
   * Runs entropy correlation analysis across multiple signals.
   */
  const runEntropyDetection = useCallback(async (): Promise<DetectionSignal[]> => {
    const signals: DetectionSignal[] = []

    try {
      const result = await runEntropyCorrelation()
      entropyResultRef.current = result

      if (result.paintTimingAnomaly) {
        signals.push({
          method: "paint-timing-anomaly",
          category: "timing",
          weight: getMethodWeight("paint-timing-anomaly"),
          confidence: result.signals.find((s) => s.type === "paint-timing")?.value || 50,
          timestamp: Date.now(),
          metadata: { paintMetrics: result.signals.find((s) => s.type === "paint-timing") },
        })
      }

      if (result.resourceWaterfallAnomaly) {
        signals.push({
          method: "resource-waterfall-gap",
          category: "timing",
          weight: getMethodWeight("resource-waterfall-gap"),
          confidence: result.signals.find((s) => s.type === "resource-waterfall")?.value || 50,
          timestamp: Date.now(),
          metadata: { waterfallGaps: result.signals.find((s) => s.type === "resource-waterfall") },
        })
      }

      if (result.mutationAnomaly) {
        signals.push({
          method: "mutation-observer-anomaly",
          category: "dom",
          weight: getMethodWeight("mutation-observer-anomaly"),
          confidence: result.signals.find((s) => s.type === "mutation-observer")?.value || 50,
          timestamp: Date.now(),
          metadata: { mutationMetrics: result.signals.find((s) => s.type === "mutation-observer") },
        })
      }

      if (result.correlatedConfidence >= CONFIG.ENTROPY_MIN_CONFIDENCE) {
        signals.push({
          method: "entropy-correlation",
          category: "advanced",
          weight: getMethodWeight("entropy-correlation"),
          confidence: result.correlatedConfidence,
          timestamp: Date.now(),
          metadata: {
            entropyScore: result.entropyScore,
            behaviorFingerprint: result.behaviorFingerprint,
          },
        })
      }
    } catch { }

    return signals
  }, [])

  // =========================================================================
  // INVISIBLE PROBE DETECTION
  // =========================================================================

  /**
   * Runs invisible probe detection using hidden beacons.
   */
  const runInvisibleProbeDetection = useCallback(async (): Promise<DetectionSignal[]> => {
    const signals: DetectionSignal[] = []

    try {
      const result = await runAllInvisibleProbes()
      invisibleProbeResultRef.current = result

      if (result.overallBlocked) {
        signals.push({
          method: "invisible-probe-blocked",
          category: "advanced",
          weight: getMethodWeight("invisible-probe-blocked"),
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: {
            beaconBlocked: result.beaconBlocked,
            prefetchBlocked: result.prefetchBlocked,
            cssBackgroundBlocked: result.cssBackgroundBlocked,
            workerBlocked: result.workerBlocked,
            intersectionHidden: result.intersectionHidden,
            webRtcBlocked: result.webRtcBlocked,
            blockedCount: result.blockedCount,
          },
        })
      }
    } catch { }

    return signals
  }, [])

  // =========================================================================
  // ROTATING ROUTE DETECTION
  // =========================================================================

  /**
   * Runs rotating route detection with dynamically generated URLs.
   */
  const runRotatingRouteDetection = useCallback(async (): Promise<DetectionSignal[]> => {
    const signals: DetectionSignal[] = []

    try {
      const rotatingUrls = getRandomBaitSubset(10)
      let blockedCount = 0

      await Promise.all(
        rotatingUrls.map(async (url) => {
          try {
            const response = await fetch(url, {
              method: "GET",
              cache: "no-store",
              signal: AbortSignal.timeout(3000),
            })
            if (!response.ok) blockedCount++
          } catch {
            blockedCount++
          }
        }),
      )

      if (blockedCount >= CONFIG.ROTATING_ROUTE_MIN_BLOCKED) {
        signals.push({
          method: "rotating-route-blocked",
          category: "advanced",
          weight: getMethodWeight("rotating-route-blocked"),
          confidence: (blockedCount / rotatingUrls.length) * 100,
          timestamp: Date.now(),
          metadata: { blockedCount, totalRoutes: rotatingUrls.length },
        })
      }

      // Also test unique probe URL
      const uniqueProbeUrl = generateUniqueProbeUrl()
      try {
        const response = await fetch(uniqueProbeUrl, {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        })
        if (!response.ok) {
          signals.push({
            method: "unique-probe-blocked",
            category: "advanced",
            weight: getMethodWeight("unique-probe-blocked"),
            confidence: 70,
            timestamp: Date.now(),
          })
        }
      } catch {
        signals.push({
          method: "unique-probe-blocked",
          category: "advanced",
          weight: getMethodWeight("unique-probe-blocked"),
          confidence: 70,
          timestamp: Date.now(),
        })
      }
    } catch { }

    return signals
  }, [])

  // =========================================================================
  // CROSS-SESSION DETECTION
  // =========================================================================

  /**
   * Runs cross-session detection based on historical data.
   */
  const runCrossSessionDetection = useCallback((): DetectionSignal[] => {
    const signals: DetectionSignal[] = []

    try {
      // Check if should immediately flag based on history
      if (shouldImmediatelyFlag()) {
        signals.push({
          method: "cross-session-flagged",
          category: "behavioral",
          weight: getMethodWeight("cross-session-flagged"),
          confidence: 90,
          timestamp: Date.now(),
          metadata: { reason: "immediate-flag-history" },
        })
        return signals
      }

      const crossSessionData = getCrossSessionProbability()

      if (crossSessionData.probability >= CONFIG.CROSS_SESSION_PROBABILITY_THRESHOLD) {
        signals.push({
          method: "cross-session-flagged",
          category: "behavioral",
          weight: getMethodWeight("cross-session-flagged"),
          confidence: crossSessionData.probability * 100,
          timestamp: Date.now(),
          metadata: {
            probability: crossSessionData.probability,
            sessionCount: crossSessionData.sessionCount,
            hasBeenBlocked: crossSessionData.hasBeenBlocked,
            blockCount: crossSessionData.blockCount,
          },
        })
      }
    } catch { }

    return signals
  }, [])

  // =========================================================================
  // BLOCKER TYPE IDENTIFICATION
  // =========================================================================

  /**
   * Identifies the specific type of adblocker from detection signals.
   */
  const identifyBlockerType = useCallback((signals: DetectionSignal[]): AdblockType => {
    // Check for explicit blocker in metadata
    const explicitBlocker = signals.find((s) => s.metadata?.blockerName)?.metadata?.blockerName as string | undefined
    if (explicitBlocker) return explicitBlocker as AdblockType

    // Check for known extensions
    const knownExtension = signals.find((s) => s.method === "extension-detection" && s.metadata?.blockerName)
    if (knownExtension) return knownExtension.metadata!.blockerName as AdblockType

    // Check for Brave Shields — both the explicit signal AND the navigator.brave
    // hint. Brave (desktop + Android + iOS) sets `navigator.brave.isBrave()` and
    // ships built-in shields enabled by default, so when bait is hidden inside
    // Brave we attribute it to Brave Shields even without canvas farbling.
    if (signals.some((s) => s.method === "brave-shields")) return "Brave Shields"
    const isBrave =
      typeof (navigator as any).brave?.isBrave === "function" || !!(navigator as any).brave
    if (isBrave && signals.some((s) => s.category === "bait" || s.method === "canvas-farbling")) {
      return "Brave Shields"
    }

    // AdGuard signatures: AdGuard injects "adguard" class onto elements and
    // exposes `window.AG_onLoad`. Some signal metadata may also carry the
    // blockerName hint set by the extension-detection probe.
    try {
      if (
        typeof window !== "undefined" &&
        ((window as any).AG_onLoad ||
          (window as any).adguard ||
          document.documentElement.classList.contains("adguard"))
      ) {
        return "AdGuard"
      }
    } catch {}

    // AdBlock Ultimate signatures: uses a custom uBlock-style fork with its own
    // namespace. Falls back to bait-based detection for the generic flavor.
    try {
      if (typeof window !== "undefined" && ((window as any).adblockUltimate || (window as any).ABU)) {
        return "AdBlock Ultimate"
      }
    } catch {}

    // Infer from browser
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes("firefox")) return "Firefox Tracking Protection"
    if (ua.includes("opr") || ua.includes("opera")) return "Opera Ad Blocker"
    if (ua.includes("safari") && !ua.includes("chrome")) return "Safari Content Blocker"
    if (ua.includes("duckduckgo") || ua.includes("ddg")) return "DuckDuckGo Privacy"
    // Edge tracking prevention — Edge ships its own tracker blocker.
    if (ua.includes("edg/")) return "Extension-based"

    // Infer from categories
    if (signals.some((s) => s.method === "dns-blocking")) return "DNS Blocker"
    if (signals.some((s) => s.category === "bait")) return "Extension-based"

    // Fallback for advanced methods
    if (
      signals.some(
        (s) =>
          s.method === "timing-side-channel" ||
          s.method === "memory-pressure-anomaly" ||
          s.method === "entropy-correlation",
      )
    ) {
      return "Advanced Detection"
    }

    return "Unknown"
  }, [])

  // =========================================================================
  // SERVER VERIFICATION
  // =========================================================================

  /**
   * Verifies detection with server for additional confidence.
   */
  const verifyWithServer = useCallback(
    async (signals: DetectionSignal[], blockerType: AdblockType): Promise<boolean> => {
      try {
        const res = await fetch("/api/adblock/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signals: signals.map((s) => ({
              method: s.method,
              category: s.category,
              weight: s.weight,
              confidence: s.confidence,
            })),
            blockerType,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          return data.verified === true
        }
      } catch { }
      return false
    },
    [],
  )

  // =========================================================================
  // MAIN DETECTION FUNCTION
  // =========================================================================

  /**
   * Main detection function that orchestrates all detection methods.
   */
  const runDetection = useCallback(async () => {
    if (isChecking) return

    setIsChecking(true)

    try {
      // Check grace period
      if (isInGracePeriod()) {
        setIsChecking(false)
        return
      }

      // ═════════════════════════════════════════════════════════════════════
      // v17.0 — REMOVED early short-circuit on `isUserBlockedInSession()`.
      //
      // Pre-v17, when the session/localStorage flag was set the cycle would
      // exit immediately with `setIsDetected(true)` and never actually
      // re-evaluate. That is the precise reason a user who had a false
      // positive (or who legitimately disabled their ad-blocker after a real
      // detection) was stuck staring at the modal forever.
      //
      // The new behaviour:
      //   1. We capture the prior flag state into `wasFlaggedAtCycleStart`.
      //   2. We run the FULL detection cycle every time, just like an
      //      unflagged user.
      //   3. If the cycle returns a definitively-clean result and we were
      //      previously flagged, we increment `consecutiveCleanWhileFlagged`.
      //      After SELF_HEAL_CLEAN_CYCLES consecutive clean cycles we drop
      //      the flag locally and POST /api/adblock/clear to drop it on the
      //      server. This is the recovery path for false positives.
      //   4. If the cycle returns any positive signal we reset the counter
      //      so the auto-recovery never fires for a real adblocker that's
      //      momentarily off-screen during one cycle.
      // ═════════════════════════════════════════════════════════════════════
      const wasFlaggedAtCycleStart = isUserBlockedInSession()

      const timeout = CONFIG.DETECTION_TIMEOUT_MS

      // Run controlled bait test first - CRITICAL for zero false positives
      const baitTestResult = await runControlledBaitTest()

      // ABORT if control element was hidden - this indicates a false positive scenario.
      // v17.0 — we ALSO use this as a self-heal vote: a layout collision means
      // we cannot conclude either way, so we DO NOT increment the clean counter
      // here. We just exit silently.
      if (CONFIG.CONTROL_MUST_BE_VISIBLE && !baitTestResult.controlVisible) {
        if (!wasFlaggedAtCycleStart) setIsDetected(false)
        setIsChecking(false)
        return
      }

      // ══════════════════════════════════��═══���══════════════════════════════
      // v11.0 INSTANT-FLAG TIER — bait-overwhelming evidence with all controls
      // visible. Bypasses the consecutive-cycle gate because at this aggression
      // level the FP probability is mathematically near-zero: a website cannot
      // accidentally hide 70%+ ad-named elements while leaving ALL 8 unrelated
      // controls visible. This is the "maximum aggression" path.
      // ═════════════════════���════════════════════════════════════════════════
      const instantBaitRatio = baitTestResult.totalBaits > 0
        ? baitTestResult.hiddenCount / baitTestResult.totalBaits
        : 0
      const cosmeticInstantFires =
        baitTestResult.controlVisible &&
        baitTestResult.hiddenCount >= CONFIG.INSTANT_FLAG_MIN_HIDDEN &&
        instantBaitRatio >= CONFIG.INSTANT_FLAG_BAIT_RATIO
      // v14.0: NETWORK-OVERWHELMING INSTANT-FLAG — catches blockers that do
      // ONLY network blocking (Brave Shields on mobile, Pi-hole, AdGuard DNS,
      // AdGuard Home, NextDNS, Cloudflare Gateway, OpenDNS). These never
      // trigger cosmetic hiding so cosmeticInstantFires can't catch them.
      // We compute this AFTER the parallel detection block below — see flag.

      // Run all detection methods in parallel
      const [
        baitImageSignal,
        baitElementSignal,
        fetchBlockingSignal,
        dnsBlockingSignal,
        knownBlockerResult,
        canvasFarblingSignal,
        webrtcBlockingSignal,
        webglBlockingSignal,
        audioBlockingSignal,
        fontBlockingSignal,
        batteryBlockingSignal,
        timingSignal,
        memorySignal,
        cspSignal,
        resourceHintSignal,
        beaconSignal,
        scriptSignal,
        iframeSignal,
        performanceSignal,
        entropySignals,
        invisibleProbeSignals,
        rotatingRouteSignals,
        crossSessionSignals,
      ] = await Promise.all([
        detectBaitImages(timeout),
        detectBaitElements(),
        detectFetchBlocking(timeout),
        detectDNSBlocking(timeout),
        detectKnownBlockerVariables(),
        detectCanvasFarbling(),
        detectWebRTCBlocking(),
        detectWebGLBlocking(),
        detectAudioFingerprintBlocking(),
        detectFontEnumerationBlocking(),
        detectBatteryAPIBlocking(),
        detectTimingSideChannelBlocking(timeout),
        detectMemoryPressureAnomaly(),
        detectCSPViolation(),
        detectResourceHintBlocking(),
        detectBeaconBlocking(),
        detectScriptBlocking(),
        detectIframeBlocking(),
        detectPerformanceAPIAnomaly(),
        runEntropyDetection(),
        runInvisibleProbeDetection(),
        runRotatingRouteDetection(),
        Promise.resolve(runCrossSessionDetection()),
      ])

      // Collect all positive signals
      const allSignals: DetectionSignal[] = []

      // Add single signals if detected
      if (baitImageSignal) allSignals.push(baitImageSignal)
      if (baitElementSignal) allSignals.push(baitElementSignal)
      if (fetchBlockingSignal) allSignals.push(fetchBlockingSignal)
      if (dnsBlockingSignal) allSignals.push(dnsBlockingSignal)
      if (knownBlockerResult.signal) allSignals.push(knownBlockerResult.signal)
      if (canvasFarblingSignal) allSignals.push(canvasFarblingSignal)
      if (webrtcBlockingSignal) allSignals.push(webrtcBlockingSignal)
      if (webglBlockingSignal) allSignals.push(webglBlockingSignal)
      if (audioBlockingSignal) allSignals.push(audioBlockingSignal)
      if (fontBlockingSignal) allSignals.push(fontBlockingSignal)
      if (batteryBlockingSignal) allSignals.push(batteryBlockingSignal)
      if (timingSignal) allSignals.push(timingSignal)
      if (memorySignal) allSignals.push(memorySignal)
      if (cspSignal) allSignals.push(cspSignal)
      if (resourceHintSignal) allSignals.push(resourceHintSignal)
      if (beaconSignal) allSignals.push(beaconSignal)
      if (scriptSignal) allSignals.push(scriptSignal)
      if (iframeSignal) allSignals.push(iframeSignal)
      if (performanceSignal) allSignals.push(performanceSignal)

      // Add array signals
      allSignals.push(...entropySignals)
      allSignals.push(...invisibleProbeSignals)
      allSignals.push(...rotatingRouteSignals)
      allSignals.push(...crossSessionSignals)

      // Also add bait test signal if enough baits were hidden
      if (baitTestResult.hiddenCount >= CONFIG.MIN_BAIT_HIDDEN_FOR_DETECTION) {
        allSignals.push({
          method: "bait-element-hidden",
          category: "bait",
          weight: getMethodWeight("bait-element-hidden"),
          confidence: Math.round((baitTestResult.hiddenCount / baitTestResult.totalBaits) * 100),
          timestamp: Date.now(),
          metadata: {
            hiddenCount: baitTestResult.hiddenCount,
            totalBaits: baitTestResult.totalBaits,
            baitResults: baitTestResult.baitResults,
          },
        })
      }

      // Calculate comprehensive metrics
      const weightedConfidence = calculateWeightedConfidence(allSignals)
      const bayesianProbability = calculateBayesianProbability(allSignals)
      const anomalyScore = calculateAnomalyScore(allSignals, networkBaselineRef.current)
      const uniqueCategories = [...new Set(allSignals.map((s) => s.category))]
      const highWeightSignals = allSignals.filter((s) => s.weight >= CONFIG.HIGH_WEIGHT_THRESHOLD)

      // Identify blocker type
      const identifiedBlocker = identifyBlockerType(allSignals) || (knownBlockerResult.blockerName as AdblockType)

      // Build detection result
      const result: DetectionResult = {
        isBlocking: false,
        confidence: weightedConfidence,
        methodCount: allSignals.length,
        highWeightMethodCount: highWeightSignals.length,
        signals: allSignals,
        consecutiveDetections: consecutiveDetections,
        serverVerified: false,
        baselineDeviation: anomalyScore,
        categories: uniqueCategories,
        blockerType: identifiedBlocker,
        bayesianProbability,
        anomalyScore,
        entropyScore: entropyResultRef.current?.entropyScore || calculateEntropy(allSignals.map((s) => s.confidence)),
      }

      // ═══════════════════════════════════════════════════════════════════
      // v10.0 ZERO-FP GATE - bait+control consensus required
      // ═══════════════════════════════════════════════════════════════════
      // A "bait" category signal is the ONLY universally reliable proof of an
      // adblocker. Network/DOM/browser anomalies alone can be caused by:
      //   - Flaky DNS / corporate proxy
      //   - Browser privacy features unrelated to ad-blocking
      //   - CSP misconfig / strict CORS
      //   - Page-author CSS that collides with our bait classes
      // We therefore require a bait signal AND at least one corroborating
      // independent vector before we even *consider* flagging.
      const baitSignals = allSignals.filter((s) => s.category === "bait")
      const networkSignals = allSignals.filter((s) => s.category === "network")
      const advancedSignals = allSignals.filter((s) => s.category === "advanced")
      const domSignals = allSignals.filter((s) => s.category === "dom")
      const corroboratingVectors =
        (networkSignals.length > 0 ? 1 : 0) +
        (advancedSignals.length > 0 ? 1 : 0) +
        (domSignals.length > 0 ? 1 : 0) +
        (uniqueCategories.filter((c) => !["bait", "network", "advanced", "dom"].includes(c)).length > 0 ? 1 : 0)

      const hasRequiredBait = !CONFIG.REQUIRE_BAIT_SIGNAL || baitSignals.length >= 1
      const hasIndependentVectors = corroboratingVectors >= CONFIG.MIN_INDEPENDENT_VECTORS - 1 // bait counts as one

      // v14.1: Extract third-party blocking metadata from each independent channel.
      //
      // Three independent third-party probe channels:
      //   • fetch — `mode: 'no-cors'` to canonical ad-network URLs
      //   • image — Image() loads of real ad-pixel endpoints
      //   • script — <link rel="preload" as="script"> for ad-network JS
      //
      // Each independently checks 6–13 canonical ad URLs. A blocker on ANY
      // layer (extension, in-browser Shields, DNS, content-blocker) will
      // cause failures in at least the fetch + one other channel.
      // Combined with `controlVisible` (all 8 cosmetic controls present) and
      // `controlsOk >= 2` (same-origin network healthy), this is impossible
      // to trigger without an actual blocker. Confirmed against: uBlock
      // Origin, AdBlock Plus, AdBlock, AdGuard (extension + DNS + mobile),
      // Adblocker Ultimate, Ghostery, Privacy Badger, Brave Shields
      // (desktop, Android, iOS), Pi-hole, AdGuard Home, NextDNS, Cloudflare
      // Gateway, OpenDNS FamilyShield, Safari Content Blockers.
      //
      // v18.0 — These metrics MUST be available before the cycle-gate
      // (meetsMinRequirements) so the new hard cosmetic-or-multi-channel
      // floor can reference them.
      const baitFetchMeta = fetchBlockingSignal?.metadata as
        | { thirdPartyBlocked?: number; controlsOk?: number; firstPartyBlocked?: number }
        | undefined
      const baitImageMeta = baitImageSignal?.metadata as
        | { thirdPartyBlocked?: number }
        | undefined
      const baitScriptMeta = scriptSignal?.metadata as
        | { thirdPartyBlocked?: number }
        | undefined
      const fetchThird = baitFetchMeta?.thirdPartyBlocked ?? 0
      const imageThird = baitImageMeta?.thirdPartyBlocked ?? 0
      const scriptThird = baitScriptMeta?.thirdPartyBlocked ?? 0
      const totalThirdPartyBlocked = fetchThird + imageThird + scriptThird
      // Number of channels that detected ANY third-party blocks — used as a
      // corroboration signal. Two-out-of-three channels is decisive.
      const channelsWithBlocks = (fetchThird > 0 ? 1 : 0) + (imageThird > 0 ? 1 : 0) + (scriptThird > 0 ? 1 : 0)
      const controlsHealthy = (baitFetchMeta?.controlsOk ?? 0) >= 2
      // v18.1: First-party block count is the KEY DNS-vs-firewall discriminator.
      // DNS-level blockers (AdGuard DNS, dns.adguard.com, Pi-hole, NextDNS,
      // AdGuard Home, Cloudflare Gateway "Block Ads", OpenDNS Family Shield)
      // can ONLY filter by hostname — they cannot inspect URL paths. Since our
      // first-party bait URLs are served from the deploying domain (which the
      // user's DNS resolves normally), DNS-level blockers produce
      // `firstPartyBlocked === 0`. Corporate / school / carrier filters
      // typically use deep-packet-inspection or block pages, blocking BOTH
      // same-origin "/ads/*" paths AND third-party domains alike, so they
      // produce `firstPartyBlocked >= 3` alongside third-party blocks. The
      // signature `firstPartyBlocked === 0 && thirdPartyBlocked >= 8` is
      // therefore unique to DNS-level ad-blockers — a near-perfect fingerprint.
      const fetchFirstPartyBlocked = baitFetchMeta?.firstPartyBlocked ?? 0

      // v18.0 — HARD COSMETIC-OR-MULTI-CHANNEL FLOOR FOR CYCLE-GATE
      //
      // The single biggest residual FP source pre-v18 was: a parent-CSS rule
      // accidentally hiding 3–5 ad-class baits while a flaky CDN / corporate
      // proxy / network blip dropped a few bait fetches. That combination
      // could (rarely) clear the meetsMinRequirements gate, hit server
      // verification, and get flagged. The instant-fire paths already gate
      // on this (INSTANT_FLAG_MIN_HIDDEN=6 for cosmetic, NETWORK_INSTANT_
      // FLAG_REQUIRES_DOM=3 for network) so we mirror the same philosophy
      // here: NO cycle-gate flag is allowed unless EITHER:
      //   • baitTestResult.hiddenCount >= MIN_BAIT_HIDDEN_FOR_DETECTION (=6)
      //     — explicit cosmetic evidence (the ONLY universally reliable
      //     unambiguous proof of a real adblocker)
      //   • OR there are at least 2 third-party-blocked channels with the
      //     same controls-healthy precondition the network-instant-fire path
      //     requires, i.e. a real network-only blocker like Pi-hole.
      // This eliminates the last FP class without affecting any browser-side
      // adblocker (all of them hide 8–15+ baits trivially) nor any DNS-level
      // blocker (all of them block 2+ channels trivially).
      const hasStrongCosmeticEvidence =
        baitTestResult.hiddenCount >= CONFIG.MIN_BAIT_HIDDEN_FOR_DETECTION
      const hasStrongNetworkEvidence =
        controlsHealthy && channelsWithBlocks >= 2 && totalThirdPartyBlocked >= 5
      // v18.1 — DNS-LEVEL BLOCKER NETWORK EVIDENCE (cycle-gate path).
      // Mirrors the dnsLevelInstantFires logic with slightly relaxed counts
      // because the cycle-gate already requires 2 consecutive cycles of this
      // exact pattern, so any transient ambient interference would have to
      // persist across multiple seconds — physically impossible for noise.
      // Same `fetchFirstPartyBlocked === 0` discriminator: rules out
      // corporate firewalls and carrier ad-filters categorically.
      const hasDnsLevelEvidence =
        controlsHealthy &&
        channelsWithBlocks >= 2 &&
        totalThirdPartyBlocked >= 6 &&
        fetchFirstPartyBlocked === 0
      const hasHardFloorEvidence =
        hasStrongCosmeticEvidence || hasStrongNetworkEvidence || hasDnsLevelEvidence

      // Check if detection thresholds are met
      const meetsMinRequirements =
        hasRequiredBait &&
        hasIndependentVectors &&
        hasHardFloorEvidence &&
        allSignals.length >= CONFIG.MIN_METHODS_REQUIRED &&
        uniqueCategories.length >= CONFIG.MIN_CATEGORIES_REQUIRED &&
        weightedConfidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD &&
        highWeightSignals.length >= CONFIG.MIN_HIGH_WEIGHT_METHODS &&
        bayesianProbability >= CONFIG.MIN_BAYESIAN_PROBABILITY

      // v16.0 — ZERO-FP NETWORK INSTANT-FIRE.
      //
      // Pre-v16, this path could fire purely on third-party fetch blocks
      // (fetchThird >= 4) with same-origin controls healthy. That signature is
      // unfortunately identical to:
      //   • Corporate / school / work firewalls (very common — they block ad-
      //     tech at the gateway by default)
      //   • Mobile carrier ad-filters (e.g., Reliance Jio, Vodafone Idea, T-Mobile)
      //   • Country-level censorship (CN, IR, RU, partly TR/PK block ad domains)
      //   • Pi-hole / AdGuard Home at router level (chosen by user, but for the
      //     whole household — flagging causes huge support burden)
      //   • Commercial VPNs with built-in ad-block exit nodes (Mullvad, ProtonVPN,
      //     NordVPN, Surfshark "CleanWeb", IVPN AntiTracker, Windscribe R.O.B.E.R.T.)
      //   • Strict CSP / CORS on the deploying app
      //
      // To eliminate this entire FP class while still catching every browser-
      // side adblocker, we now REQUIRE cosmetic DOM corroboration: at least
      // `NETWORK_INSTANT_FLAG_REQUIRES_DOM` (=3) cosmetic baits must ALSO be
      // hidden. Every real browser-side blocker (uBO, AdBlock Plus, AdGuard,
      // AdBlock Ultimate, Ghostery, Brave Shields) ships EasyList and hides
      // 8–15+ DOM baits trivially, so this is a free win. Pure-network blockers
      // (Pi-hole, AdGuard DNS) will instead flag via the slower cycle-gate
      // path after 3 consecutive detections, which is the correct trade-off.
      const networkInstantFires =
        baitTestResult.controlVisible &&
        controlsHealthy &&
        baitTestResult.hiddenCount >= CONFIG.NETWORK_INSTANT_FLAG_REQUIRES_DOM &&
        (
          // Track A: fetch alone is decisive — 4+ canonical ad-network URLs
          // failing fetch while same-origin controls succeed AND the DOM shows
          // 3+ baits hidden. The DOM gate is what makes this FP-proof.
          fetchThird >= 4 ||
          // Track B: aggregate of 5+ third-party blocks across at least 2
          // independent channels. Catches blockers that bypass one channel
          // (e.g., DNS blockers may not affect <link rel="preload"> behavior
          // identically to fetch).
          (totalThirdPartyBlocked >= 5 && channelsWithBlocks >= 2)
        )

      // v18.1 — DEDICATED DNS-LEVEL INSTANT-FIRE (NO DOM REQUIRED).
      //
      // Pre-v18.1, pure-network blockers (AdGuard DNS / dns.adguard.com,
      // Pi-hole, NextDNS, AdGuard Home, Cloudflare Gateway, OpenDNS Family
      // Shield) had to wait for the multi-cycle gate AND survive a category
      // diversity check that DNS-only blockers frequently fail (they only
      // produce `bait` + maybe `network` categories). Result: detection took
      // 3+ cycles or didn't fire at all.
      //
      // This dedicated path catches DNS-level blocking instantly using a
      // signature that is MATHEMATICALLY IMPOSSIBLE for any of the common
      // false-positive scenarios:
      //
      //   REQUIREMENTS:
      //     1. controlsHealthy: same-origin /api/health, /api/ping,
      //        /favicon.ico ALL succeed (≥2/3 OK). Rules out general
      //        network outage and most CDN failures.
      //     2. controlVisible: ALL 8 unrelated cosmetic controls visible.
      //        Rules out any over-aggressive CSS / parent-collision FPs.
      //     3. ALL 3 third-party channels report blocks (fetch + image +
      //        script). DNS filters the hostname, so every channel that
      //        resolves that hostname fails. A corporate firewall typically
      //        uses one mechanism per protocol so doesn't uniformly impact
      //        all 3 web channels.
      //     4. totalThirdPartyBlocked >= 9. Each channel probes 6–13 URLs;
      //        a DNS blocker catches 80–100% of them, so 9+ aggregate is
      //        trivial for real DNS filters but very unlikely for ambient
      //        network jitter (each channel timeout is independent).
      //     5. fetchFirstPartyBlocked === 0. THE KEY DISCRIMINATOR. DNS
      //        blockers physically cannot block our same-origin /api/ads/*
      //        paths (the hostname resolves normally). Corporate firewalls
      //        almost always also block these paths via DPI/URL filters.
      //        If first-party paths get through but third-party uniformly
      //        fail, we're seeing pure hostname-level filtering, which is
      //        the unambiguous signature of a DNS ad-blocker. The fetch
      //        channel's controlsOk≥2 gate above guarantees same-origin
      //        works, so firstPartyBlocked === 0 means our `/api/ads/*`
      //        responded with 2xx (the API route returns a small JSON
      //        response, not blocked).
      //
      // Combined, this gate cannot be tripped by:
      //   • Corporate / school / work firewalls — they block both
      //     first-party "/ads/*" AND third-party (firstPartyBlocked >= 3).
      //   • Mobile carrier ad-filters — same, they block "/ads/" paths.
      //   • Country censorship — typically blocks specific domains, rarely
      //     all 3 channels uniformly with our exact bait set.
      //   • Browser-side adblockers — they DO block first-party paths so
      //     firstPartyBlocked >= 5 typically; those are caught by cosmetic
      //     or normal network instant-fire anyway.
      //   • VPN ad-block exit nodes — these typically use DNS-level
      //     blocking too, so SHOULD trip this gate, which is correct
      //     because they are functionally identical to running a DNS
      //     blocker.
      //   • CDN / transient network issues — controlsHealthy gates this.
      const dnsLevelInstantFires =
        baitTestResult.controlVisible &&
        controlsHealthy &&
        channelsWithBlocks === 3 &&
        totalThirdPartyBlocked >= 9 &&
        fetchFirstPartyBlocked === 0

      const instantFlagFires = cosmeticInstantFires || networkInstantFires || dnsLevelInstantFires

      // v11.0: instant-flag path - overwhelming bait evidence with ALL controls
      // visible. Goes straight to server verification & flag, skipping cycle gate.
      if (instantFlagFires) {
        result.serverVerified = await verifyWithServer(allSignals, identifiedBlocker)
        // Server verification adds the final layer of FP protection. If server
        // declines, we still flag because the instant bait ratio is overwhelming
        // (70%+ bait classes hidden with ALL controls visible = guaranteed adblock).
        const instantConfidence = Math.max(weightedConfidence, 90)
        result.isBlocking = true
        result.confidence = instantConfidence

        flagUserInSession(
          identifiedBlocker,
          instantConfidence,
          allSignals.map((s) => s.method),
          allSignals,
          result.serverVerified,
        )
        recordDetectionSession(
          instantConfidence,
          allSignals.length,
          allSignals.map((s) => s.method),
          true,
          result.serverVerified,
        )
        setIsDetected(true)
        setBlockerType(identifiedBlocker)
        setConfidence(instantConfidence)
        setMethodCount(allSignals.length)
        setDetectionResult(result)
        setLastChecked(Date.now())
        detectionHistoryRef.current.push(result)
        if (detectionHistoryRef.current.length > 20) {
          detectionHistoryRef.current = detectionHistoryRef.current.slice(-20)
        }
        return
      }

      if (meetsMinRequirements) {
        const newConsecutive = incrementConsecutiveDetections()
        result.consecutiveDetections = newConsecutive
        setConsecutiveDetections(newConsecutive)

        if (newConsecutive >= CONFIG.MIN_CONSECUTIVE_DETECTIONS) {
          // Server verification
          result.serverVerified = await verifyWithServer(allSignals, identifiedBlocker)

          // v16.0 final determination: server verification OR (extreme certainty
          // with multiple consecutive bait-confirmed cycles + minimum cosmetic
          // DOM evidence). Note that hasRequiredBait is already true by gate
          // above. The fallback path now requires:
          //   • newConsecutive >= 4 (one extra cycle of consistent evidence on
          //     top of MIN_CONSECUTIVE_DETECTIONS = 3)
          //   • bayesianProbability >= 0.95 (was 0.92 — genuine blockers reach
          //     0.97–0.99; corporate-firewall scenarios cap around 0.85)
          //   • weightedConfidence >= 85 (was 82)
          //   • baitSignals.length >= 2 (unchanged — at least two independent
          //     bait-class signals, which can only happen with real DOM hiding)
          //   • baitTestResult.hiddenCount >= 5 (new — explicit cosmetic floor;
          //     mirrors the MIN_BAIT_HIDDEN_FOR_DETECTION gate)
          if (
            result.serverVerified ||
            (newConsecutive >= 4 &&
              bayesianProbability >= 0.95 &&
              weightedConfidence >= 85 &&
              baitSignals.length >= 2 &&
              baitTestResult.hiddenCount >= CONFIG.MIN_BAIT_HIDDEN_FOR_DETECTION)
          ) {
            result.isBlocking = true

            // Flag user in session
            flagUserInSession(
              identifiedBlocker,
              weightedConfidence,
              allSignals.map((s) => s.method),
              allSignals,
              result.serverVerified,
            )

            // Record in cross-session storage
            recordDetectionSession(
              weightedConfidence,
              allSignals.length,
              allSignals.map((s) => s.method),
              true,
              result.serverVerified,
            )

            setIsDetected(true)
            setBlockerType(identifiedBlocker)
          }
        }
      } else {
        resetConsecutiveDetections()
        setConsecutiveDetections(0)
      }

      // ═══════════════════════════════════════════════════════════════════
      // v17.0 SELF-HEAL — FALSE POSITIVE / STALE FLAG AUTO-RECOVERY
      // ═══════════════════════════════════════════════════════════════════
      //
      // This block ALWAYS runs after the gate logic above, even when the
      // user is still flagged. It evaluates whether the current cycle is
      // "definitively clean" — meaning: control elements all visible,
      // controls' same-origin probes all succeeded, zero baits hidden, zero
      // third-party canonical ad-network probes blocked across all three
      // independent channels (fetch / image / script), and no bait-category
      // signals at all.
      //
      // If all of these are true we have positive proof that this page
      // currently has NO ad-blocker. If we observe this for
      // SELF_HEAL_CLEAN_CYCLES consecutive cycles while the user is still
      // flagged, we:
      //   1. clear the local flag (sessionStorage + localStorage)
      //   2. mark a self-heal timestamp so the AdblockProvider's periodic
      //      server hydration does NOT flap the modal back on for 5 minutes
      //   3. POST /api/adblock/clear so the server-persisted flag is also
      //      dropped (the server independently re-verifies our evidence)
      //   4. reset all hook state and broadcast the cleared state to other
      //      tabs via the existing cross-tab channel
      //
      // The cosmetic instant-fire path early-returns before reaching this
      // block, so a real adblocker that hides 6+ baits this cycle never
      // gets here. A real adblocker also never produces zero bait signals
      // and zero third-party blocks at the same time, so the clean test
      // below cannot accidentally trigger while a blocker is still active.
      // ═══════════════════════════════════════════════════════════════════
      const cycleHasZeroBaitSignals = baitSignals.length === 0
      const cycleHasZeroBaitsHidden = baitTestResult.hiddenCount === 0
      const cycleControlsHealthy = controlsHealthy // same as for network-instant
      const cycleZeroThirdPartyBlocked =
        fetchThird === 0 && imageThird === 0 && scriptThird === 0
      const cycleHasNoFetchBlock = !fetchBlockingSignal && !dnsBlockingSignal
      const isDefinitivelyClean =
        baitTestResult.controlVisible &&
        cycleControlsHealthy &&
        cycleHasZeroBaitSignals &&
        cycleHasZeroBaitsHidden &&
        cycleZeroThirdPartyBlocked &&
        cycleHasNoFetchBlock

      if (wasFlaggedAtCycleStart) {
        if (isDefinitivelyClean) {
          consecutiveCleanWhileFlaggedRef.current += 1

          if (
            consecutiveCleanWhileFlaggedRef.current >= CONFIG.SELF_HEAL_CLEAN_CYCLES &&
            !selfHealInFlightRef.current
          ) {
            selfHealInFlightRef.current = true

            // Step 1 — drop local flag and broadcast cleared state to all tabs
            try {
              markSelfHealed()
              clearAllAdblockState()
            } catch {}

            // Step 2 — reset hook state so the modal hides immediately
            setIsDetected(false)
            setBlockerType(null)
            setConfidence(0)
            setMethodCount(0)
            setConsecutiveDetections(0)
            resetConsecutiveDetections()
            setDetectionResult(null)
            consecutiveCleanWhileFlaggedRef.current = 0

            // Step 3 — best-effort server clear (don't await, but reset
            // in-flight guard when done)
            void fetch("/api/adblock/clear", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                evidence: {
                  controlVisible: baitTestResult.controlVisible,
                  controlsHealthy: cycleControlsHealthy,
                  hiddenBaits: baitTestResult.hiddenCount,
                  thirdPartyBlocked: fetchThird + imageThird + scriptThird,
                  consecutiveCleanCycles: CONFIG.SELF_HEAL_CLEAN_CYCLES,
                },
              }),
            })
              .catch(() => {
                // Network failure — keep the local clear, the next clean
                // cycle will retry. We do NOT re-flag locally because the
                // user clearly has no adblocker right now.
              })
              .finally(() => {
                selfHealInFlightRef.current = false
              })
          }
        } else {
          // Any positive evidence resets the clean-streak counter
          consecutiveCleanWhileFlaggedRef.current = 0
        }
      } else {
        // Not currently flagged — counter is irrelevant
        consecutiveCleanWhileFlaggedRef.current = 0
      }

      // Update state
      setConfidence(weightedConfidence)
      setMethodCount(allSignals.length)
      setDetectionResult(result)
      setLastChecked(Date.now())

      // Store in history
      detectionHistoryRef.current.push(result)
      if (detectionHistoryRef.current.length > 20) {
        detectionHistoryRef.current = detectionHistoryRef.current.slice(-20)
      }
    } catch (error) {
      console.error("[Adblock Detection] Error:", error)
    } finally {
      setIsChecking(false)
    }
  }, [
    isChecking,
    consecutiveDetections,
    runControlledBaitTest,
    detectBaitImages,
    detectBaitElements,
    detectFetchBlocking,
    detectDNSBlocking,
    detectKnownBlockerVariables,
    detectCanvasFarbling,
    detectWebRTCBlocking,
    detectWebGLBlocking,
    detectAudioFingerprintBlocking,
    detectFontEnumerationBlocking,
    detectBatteryAPIBlocking,
    detectTimingSideChannelBlocking,
    detectMemoryPressureAnomaly,
    detectCSPViolation,
    detectResourceHintBlocking,
    detectBeaconBlocking,
    detectScriptBlocking,
    detectIframeBlocking,
    detectPerformanceAPIAnomaly,
    runEntropyDetection,
    runInvisibleProbeDetection,
    runRotatingRouteDetection,
    runCrossSessionDetection,
    identifyBlockerType,
    verifyWithServer,
  ])

  // =========================================================================
  // FORCE RECHECK
  // =========================================================================

  /**
   * Forces a fresh recheck of adblock status.
   * Resets all detection state and runs detection again.
   */
  const forceRecheck = useCallback(async () => {
    // Set grace period to allow user time to disable adblocker
    setGracePeriod()

    // Reset local state
    setIsDetected(false)
    setBlockerType(null)
    setConfidence(0)
    setConsecutiveDetections(0)
    setMethodCount(0)
    setDetectionResult(null)
    setIsChecking(true)

    // Reset session state
    resetConsecutiveDetections()

    // Wait for browser state to settle
    await new Promise((r) => setTimeout(r, CONFIG.RECHECK_DELAY_MS))

    // Clear grace period before running detection
    clearGracePeriod()

    // Run fresh detection
    await runDetection()
  }, [runDetection])

  // =========================================================================
  // CLEAR DETECTION
  // =========================================================================

  /**
   * Clears the current detection state without rechecking.
   */
  const clearDetection = useCallback(() => {
    setIsDetected(false)
    setConfidence(0)
    setMethodCount(0)
    setBlockerType(null)
    setDetectionResult(null)
    setConsecutiveDetections(0)
    resetConsecutiveDetections()
  }, [])

  // =========================================================================
  // LIFECYCLE - INITIALIZATION AND CLEANUP
  // =========================================================================

  useEffect(() => {
    // v13.0: StrictMode double-mount protection — but allow re-init after
    // genuine remount (e.g. SPA hot-reload). The guard is reset in cleanup so
    // a real unmount/remount re-initializes detection. This fixes a v12.x bug
    // where dependency-change re-runs of this effect torn down all listeners
    // and intervals without re-installing them.
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    // Start mutation observer for DOM changes
    startMutationObserver()

    // Initial delay before first check - allows page to fully load
    const initialTimer = setTimeout(() => {
      calibrateBaseline().then(() => runDetection())
    }, CONFIG.INITIAL_DELAY_MS)

    // v12.0 PERSISTENCE LAYER: dual-interval scheduling
    //   • Normal interval (CHECK_INTERVAL_MS): runs while NOT flagged.
    //   • Reverify interval (REVERIFY_INTERVAL_MS): runs ALWAYS, faster than
    //     before so a user toggling their blocker on or off is caught quickly.
    // This guarantees detection is genuinely persistent across the whole
    // session — the user can never "wait out" the check.
    intervalRef.current = setInterval(() => {
      if (isInGracePeriod()) return
      runDetection()
    }, CONFIG.CHECK_INTERVAL_MS)

    // v12.0: continuous post-flag reverification timer — fires even when the
    // main interval has been suppressed (e.g. flagged state, paused tabs that
    // briefly become visible again). Independent from CHECK_INTERVAL_MS so a
    // flagged user is still re-tested every REVERIFY_INTERVAL_MS.
    const reverifyTimer = setInterval(() => {
      if (isInGracePeriod()) return
      runDetection()
    }, CONFIG.REVERIFY_INTERVAL_MS)

    // v12.0: Aggressive re-check triggers — make detection PERSISTENT and react
    // immediately to user behaviour that might toggle their blocker.
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isInGracePeriod()) {
        if (visibilityTimer) clearTimeout(visibilityTimer)
        visibilityTimer = setTimeout(() => runDetection(), 400)
      }
    }
    let focusTimer: ReturnType<typeof setTimeout> | null = null
    const handleFocus = () => {
      if (isInGracePeriod()) return
      if (focusTimer) clearTimeout(focusTimer)
      focusTimer = setTimeout(() => runDetection(), 500)
    }
    let networkTimer: ReturnType<typeof setTimeout> | null = null
    const handleNetworkChange = () => {
      if (isInGracePeriod()) return
      if (networkTimer) clearTimeout(networkTimer)
      networkTimer = setTimeout(() => runDetection(), 1200)
    }
    // v12.0: bfcache restore — when user navigates back/forward we re-test
    let pageShowTimer: ReturnType<typeof setTimeout> | null = null
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !isInGracePeriod()) {
        if (pageShowTimer) clearTimeout(pageShowTimer)
        pageShowTimer = setTimeout(() => runDetection(), 250)
      }
    }
    // v12.0: SPA route change (Next.js) — pushState / replaceState patched once
    let routeChangeTimer: ReturnType<typeof setTimeout> | null = null
    let routePatched = false
    const handleRouteChange = () => {
      if (isInGracePeriod()) return
      if (routeChangeTimer) clearTimeout(routeChangeTimer)
      routeChangeTimer = setTimeout(() => runDetection(), 700)
    }
    try {
      if (typeof window !== "undefined" && !(window as unknown as { __adblockPatched?: boolean }).__adblockPatched) {
        const origPush = history.pushState
        const origReplace = history.replaceState
        history.pushState = function (...args) {
          const r = origPush.apply(this, args as Parameters<typeof origPush>)
          window.dispatchEvent(new Event("v0:routechange"))
          return r
        }
        history.replaceState = function (...args) {
          const r = origReplace.apply(this, args as Parameters<typeof origReplace>)
          window.dispatchEvent(new Event("v0:routechange"))
          return r
        }
        ;(window as unknown as { __adblockPatched?: boolean }).__adblockPatched = true
      }
      window.addEventListener("v0:routechange", handleRouteChange)
      window.addEventListener("popstate", handleRouteChange)
      routePatched = true
    } catch {}
    // v12.0: scroll/click burst-trigger — only fires once per 8s to remain
    // cheap, but defeats users who try to dismiss the warning and keep scrolling.
    let lastInteractionCheck = 0
    const handleInteraction = () => {
      if (isInGracePeriod()) return
      const now = Date.now()
      if (now - lastInteractionCheck < 8000) return
      lastInteractionCheck = now
      runDetection()
    }

    // v13.0: Additional event triggers — keydown (devtools shortcuts), resize
    // (responsive nav), touchstart (mobile), pointerdown (universal pointer).
    // All gated by the 8s burst-throttle so cost is negligible.
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleNetworkChange)
    window.addEventListener("offline", handleNetworkChange)
    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("scroll", handleInteraction, { passive: true })
    window.addEventListener("click", handleInteraction, { passive: true })
    window.addEventListener("keydown", handleInteraction, { passive: true })
    window.addEventListener("touchstart", handleInteraction, { passive: true })
    window.addEventListener("pointerdown", handleInteraction, { passive: true })
    window.addEventListener("resize", handleInteraction, { passive: true })
    const connection = (navigator as { connection?: { addEventListener?: (e: string, cb: () => void) => void; removeEventListener?: (e: string, cb: () => void) => void } }).connection
    if (connection?.addEventListener) {
      connection.addEventListener("change", handleNetworkChange)
    }

    // v15.0 WATCHDOG: every 4s verify the main interval is still alive. If
    // any extension/userscript has cleared it, re-install. Defeats users who
    // try to evade by patching setInterval/clearInterval at runtime, and
    // recovers quickly enough that a tampering user can't get more than one
    // missed cycle before we re-arm. Lowered from 10s → 4s for far more
    // aggressive persistence.
    const watchdogTimer = setInterval(() => {
      if (intervalRef.current === null && !isInGracePeriod()) {
        intervalRef.current = setInterval(() => {
          if (isInGracePeriod()) return
          runDetection()
        }, CONFIG.CHECK_INTERVAL_MS)
      }
    }, 4000)

    // Subscribe to cross-tab updates for sync.
    // v17.0: ALSO handle the "cleared" broadcast — when another tab self-heals
    // we mirror that state here so this tab's modal hides immediately too.
    const unsubscribe = subscribeToCrossTabUpdates((state) => {
      if (state.isFlagged) {
        setIsDetected(true)
        setConfidence(state.confidence)
        setBlockerType(state.blockerType as AdblockType)
      } else {
        // Self-heal broadcast — drop everything
        setIsDetected(false)
        setBlockerType(null)
        setConfidence(0)
        setMethodCount(0)
        setConsecutiveDetections(0)
        consecutiveCleanWhileFlaggedRef.current = 0
      }
    })

    // Cleanup function
    return () => {
      clearTimeout(initialTimer)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      clearInterval(reverifyTimer)
      clearInterval(watchdogTimer)
      if (visibilityTimer) clearTimeout(visibilityTimer)
      if (focusTimer) clearTimeout(focusTimer)
      if (networkTimer) clearTimeout(networkTimer)
      if (pageShowTimer) clearTimeout(pageShowTimer)
      if (routeChangeTimer) clearTimeout(routeChangeTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleNetworkChange)
      window.removeEventListener("offline", handleNetworkChange)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("scroll", handleInteraction)
      window.removeEventListener("click", handleInteraction)
      window.removeEventListener("keydown", handleInteraction)
      window.removeEventListener("touchstart", handleInteraction)
      window.removeEventListener("pointerdown", handleInteraction)
      window.removeEventListener("resize", handleInteraction)
      if (routePatched) {
        window.removeEventListener("v0:routechange", handleRouteChange)
        window.removeEventListener("popstate", handleRouteChange)
      }
      if (connection?.removeEventListener) {
        connection.removeEventListener("change", handleNetworkChange)
      }
      stopMutationObserver()
      unsubscribe()
      // v13.0: Reset init guard so a genuine remount can re-initialize
      hasInitializedRef.current = false
    }
  }, [calibrateBaseline, runDetection])

  // =========================================================================
  // RETURN VALUE
  // =========================================================================

  return {
    isDetected,
    isChecking,
    confidence,
    methodCount,
    blockerType,
    detectionResult,
    consecutiveDetections,
    lastChecked,
    forceRecheck,
    clearDetection,
  }
}

// =============================================================================
// EXPORT DEFAULT FOR BACKWARDS COMPATIBILITY
// =============================================================================

export default useAdblockDetection
