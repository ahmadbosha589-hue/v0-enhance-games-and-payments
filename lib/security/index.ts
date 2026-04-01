// =============================================================================
// =============================================================================
// SECURITY FORTRESS v4.0 - MAIN EXPORT INDEX
// =============================================================================
// =============================================================================
//
// This module provides the ultimate server-side security verification system
// for both anti-adblock and VPN/proxy detection.
//
// CORE PRINCIPLES:
// 1. NEVER TRUST CLIENT-SIDE - All verification happens server-side
// 2. ZERO FALSE POSITIVES - Use consensus voting and control probes
// 3. MAXIMUM DETECTION - Multiple layers of verification
// 4. CRYPTOGRAPHIC PROOF - Challenge-response to prevent replay attacks
//
// =============================================================================

// Server-side adblock verification
export {
  performServerVerification,
  getRequestFingerprint,
  generateChallenge,
  verifyChallenge,
  verifyHoneypotResults,
  getHoneypotProbes,
  logHoneypotRequest,
  getServerHoneypotResults,
  type ServerVerificationRequest,
  type ServerVerificationResult,
  type RequestFingerprint,
  type HoneypotVerificationResult,
} from "./server-fortress"

// VPN/Proxy/Tor detection
export {
  detectVPNFortress,
  type VPNFortressResult,
  type ClientVPNData,
} from "./vpn-fortress"

// Legacy VPN detection (still available for backward compatibility)
export {
  detectVPN,
  type VPNDetectionResult,
} from "./vpn-detection"

// Honeypot logging utilities
export {
  logHoneypotProbeRequest,
  getHoneypotHeaders,
  createJSHoneypotResponse,
  createGIFHoneypotResponse,
  createPNGHoneypotResponse,
} from "./honeypot-logger"

// Advanced rate limiting
export {
  checkRateLimit,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitContext,
  DEFAULT_CONFIGS as RATE_LIMIT_CONFIGS,
} from "./advanced-rate-limiter"

// Abuse detection
export {
  detectAbuse,
  type AbuseDetectionResult,
  type AbuseType,
  type AbuseEvidence,
  type AbuseContext,
  THRESHOLDS as ABUSE_THRESHOLDS,
} from "./abuse-detection"

// Balance integrity
export {
  validateBalance,
  getAuthoritativeBalance,
  modifyBalance,
  repairBalance,
  generateBalanceChecksum,
  verifyBalanceChecksum,
  type BalanceValidationResult,
  type BalanceChangeRequest,
  type BalanceChangeResult,
} from "./balance-integrity"

// Referral fraud detection
export {
  type ReferralFraudResult,
} from "./referral-fraud-detector"

// Server validation
export {
  validateSecurityServerSide,
  type ServerValidationResult,
  type ClientSecurityPayload,
} from "./server-validation"

// =============================================================================
// QUICK USAGE GUIDE
// =============================================================================
//
// FOR ADBLOCK DETECTION:
// ----------------------
// 1. Client requests challenge: GET /api/adblock/verify
// 2. Client tests honeypot probes
// 3. Client submits results with challenge response: POST /api/adblock/verify
// 4. Server verifies using performServerVerification()
// 5. Server compares client claims with actual server-side probe logs
//
// FOR VPN DETECTION:
// ------------------
// 1. Server calls detectVPNFortress(ipAddress, clientData)
// 2. Function queries 10+ APIs in parallel
// 3. Consensus voting determines detection (2+ sources must agree)
// 4. Result includes confidence, methods used, and blocking recommendation
//
// ZERO FALSE POSITIVE GUARANTEES:
// -------------------------------
// - Control probes must always load (if blocked, detection aborts)
// - Multiple independent signals required
// - Server-side verification required
// - Consensus voting across multiple sources
// - Historical pattern matching
//
// =============================================================================
