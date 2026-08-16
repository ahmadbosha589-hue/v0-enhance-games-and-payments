import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"

// =============================================================================
// FALSE POSITIVE APPEAL ENDPOINT
// =============================================================================
//
// This endpoint handles appeals from users who believe they were incorrectly
// flagged for adblock usage. It performs additional verification to determine
// if the detection was a false positive.
// =============================================================================

interface AppealRequest {
  userId: string
  signals: Array<{
    method: string
    category: string
    weight: number
    confidence: number
  }>
  confidence: number
  detectionMethods: string[]
  consecutiveDetections: number
  serverVerified: boolean
  userAgent: string
  timestamp: string
}

export async function POST(req: NextRequest) {
  try {
    const body: AppealRequest = await req.json()
    const { userId, signals, confidence, detectionMethods, consecutiveDetections, serverVerified, userAgent } = body

    logger.info("Adblock appeal received", {
      userId,
      action: "adblock_appeal",
      resourceType: "appeal",
    })

    // ==========================================================================
    // APPEAL EVALUATION LOGIC
    // ==========================================================================

    // Calculate appeal score (higher = more likely false positive)
    let appealScore = 0

    // Lower confidence increases appeal likelihood
    if (confidence < 60) appealScore += 20
    if (confidence < 50) appealScore += 15

    // Fewer methods increases appeal likelihood
    if (detectionMethods.length < 4) appealScore += 15
    if (detectionMethods.length < 3) appealScore += 10

    // Not server verified increases appeal likelihood
    if (!serverVerified) appealScore += 20

    // Fewer consecutive detections increases appeal likelihood
    if (consecutiveDetections < 6) appealScore += 10
    if (consecutiveDetections < 5) appealScore += 5

    // Check for suspicious signal patterns that might indicate false positive
    const lowWeightOnly = signals.every((s) => s.weight < 70)
    if (lowWeightOnly) appealScore += 15

    // Single category detection is more likely false positive
    const categories = new Set(signals.map((s) => s.category))
    if (categories.size === 1) appealScore += 10

    // Check for known false positive patterns
    const fingerprintOnly = signals.every((s) => s.category === "fingerprint")
    if (fingerprintOnly) appealScore += 25

    // Timing-only detection is less reliable
    const timingOnly = signals.every((s) => s.category === "timing")
    if (timingOnly) appealScore += 20

    // Determine if appeal should be accepted
    // Accept if appeal score >= 50 (indicating likely false positive)
    const appealAccepted = appealScore >= 50

    logger.info("Adblock appeal decision", {
      userId,
      action: "adblock_appeal_decision",
      resourceType: "appeal",
    })

    return NextResponse.json({
      appealAccepted,
      appealScore,
      message: appealAccepted
        ? "Your appeal has been accepted. The detection appears to be a false positive."
        : "Your appeal has been reviewed but the detection appears to be accurate. Please disable your ad blocker and try again.",
      timestamp: Date.now(),
    })
  } catch (error) {
    logger.error("Adblock appeal error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json(
      {
        appealAccepted: false,
        error: "Appeal processing failed",
      },
      { status: 500 },
    )
  }
}
