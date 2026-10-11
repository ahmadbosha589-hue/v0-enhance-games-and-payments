import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { logger } from "@/lib/logger"

// =============================================================================
// FALSE POSITIVE APPEAL ENDPOINT
// =============================================================================
//
// Handles appeals from users who believe they were incorrectly flagged for
// adblock usage. Scores the detection snapshot for false-positive indicators
// and, when the appeal is ACCEPTED, actually clears the persistent flag
// (profiles.adblock_flagged + the automated fraud_flags row) so the user is
// unblocked — mirroring the self-heal semantics of /api/adblock/clear, which
// never touches admin-confirmed flags.
//
// Identity: the authenticated session user IS the appellant. body.userId is
// advisory only; a mismatch is logged and refused (403).
//
// Schema: accepts BOTH caller shapes — the warning modal sends the full
// detection snapshot, the provider sends { userId, currentState, timestamp }.
// All detection fields default so neither shape can crash the scorer.
// =============================================================================

const appealSchema = z.object({
  userId: z.string().uuid().optional(), // advisory only — never trusted
  confidence: z.number().min(0).max(100).default(0),
  detectionMethods: z.array(z.string()).default([]),
  consecutiveDetections: z.number().int().min(0).default(0),
  serverVerified: z.boolean().default(false),
  signals: z
    .array(
      z.object({
        method: z.string(),
        category: z.string(),
        weight: z.number(),
        confidence: z.number(),
      }),
    )
    .default([]),
  currentState: z.record(z.unknown()).optional(),
  userAgent: z.string().max(512).optional(),
  timestamp: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = appealSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid appeal payload" }, { status: 400 })
    }

    // Cross-user appeal attempts are refused — only the flagged user may appeal.
    if (parsed.data.userId && parsed.data.userId !== user.id) {
      logger.warn("Adblock appeal userId mismatch", {
        action: "adblock_appeal_mismatch",
        sessionUser: user.id,
        claimedUser: parsed.data.userId,
      })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { signals, detectionMethods, confidence, serverVerified, consecutiveDetections } =
      parsed.data

    // ── Scoring rubric (unchanged from the original — it is sound) ──────────
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

    // Suspicious signal patterns (only when signals are present — the
    // provider's minimal payload must not crash the scorer)
    if (signals.length > 0) {
      const lowWeightOnly = signals.every((s) => s.weight < 70)
      if (lowWeightOnly) appealScore += 15

      const categories = new Set(signals.map((s) => s.category))
      if (categories.size === 1) appealScore += 10

      const fingerprintOnly = signals.every((s) => s.category === "fingerprint")
      if (fingerprintOnly) appealScore += 25

      const timingOnly = signals.every((s) => s.category === "timing")
      if (timingOnly) appealScore += 20
    }

    const appealAccepted = appealScore >= 50
    const admin = requireAdminClient()

    if (appealAccepted) {
      // Admin-confirmed or durable flags survive appeals (same rule as
      // /api/adblock/clear — those need a human).
      const { data: openFlags } = await admin
        .from("fraud_flags")
        .select("id, status, severity, resolved_by, action_taken")
        .eq("user_id", user.id)
        .or("flag_type.eq.adblock,fraud_type.eq.adblock_user,fraud_type.eq.adblock")

      const adminConfirmed = (openFlags ?? []).some((f: unknown) => {
        const flag = f as {
          resolved_by?: string | null
          severity?: number
          action_taken?: string | null
          status?: string
        }
        if (!flag) return false
        if (flag.resolved_by) return true
        // High severity (>=7 on the 1–10 scale) is admin-only to clear.
        if (typeof flag.severity === "number" && flag.severity >= 7) return true
        if (typeof flag.action_taken === "string" && flag.action_taken.trim().length > 0) return true
        if (typeof flag.status === "string" && (flag.status === "confirmed" || flag.status === "escalated")) return true
        return false
      })

      if (adminConfirmed) {
        return NextResponse.json({
          appealAccepted: false,
          appealScore,
          message: "This flag was admin-confirmed. Please contact support to resolve it.",
        })
      }

      // Accepted: clear the persistent flag so the user is actually unblocked.
      // Mirrors the exact column set /api/adblock/clear zeroes.
      const { error: profileErr } = await admin
        .from("profiles")
        .update({
          adblock_detected_at: null,
          adblock_confidence: 0,
          adblock_blocker_type: null,
          adblock_detection_methods: [],
          adblock_server_verified: false,
          adblock_verification_score: 0,
          adblock_flagged: false,
        })
        .eq("id", user.id)

      if (profileErr) {
        logger.error("Adblock appeal profile clear failed", {
          action: "adblock_appeal_error",
          userId: user.id,
          error: String(profileErr),
        })
        return NextResponse.json(
          { appealAccepted: false, error: "Appeal processing failed" },
          { status: 500 },
        )
      }

      // Resolve the automated fraud flag (columns per the 006 fraud_flags
      // shape: fraud_type, resolution_notes, resolved_by, resolved_at).
      const { error: flagErr } = await admin
        .from("fraud_flags")
        .update({
          status: "resolved",
          resolved_by: user.id,
          resolution_notes: "Auto-resolved by accepted adblock appeal (false positive)",
          resolved_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .or("flag_type.eq.adblock,fraud_type.eq.adblock_user,fraud_type.eq.adblock")
        .in("status", ["pending_review", "open"])

      if (flagErr) {
        // Profile is already cleared — the user is unblocked; the stale flag
        // row is cosmetic and admins can resolve it. Do not fail the appeal.
        logger.warn("Adblock appeal: profile cleared but fraud_flags row left open", {
          action: "adblock_appeal_flag_stale",
          userId: user.id,
          error: String(flagErr),
        })
      }

      logger.info("Adblock appeal accepted — flag cleared", {
        action: "adblock_appeal_accepted",
        userId: user.id,
        appealScore,
      })
    } else {
      logger.info("Adblock appeal rejected", {
        action: "adblock_appeal_rejected",
        userId: user.id,
        appealScore,
      })
    }

    return NextResponse.json({
      appealAccepted,
      appealScore,
      message: appealAccepted
        ? "Your appeal has been accepted. The detection appears to be a false positive — you can earn again now."
        : "Your appeal has been reviewed but the detection appears to be accurate. Please disable your ad blocker and try again.",
      timestamp: Date.now(),
    })
  } catch (error) {
    logger.error("Adblock appeal error", {
      action: "adblock_appeal_error",
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { appealAccepted: false, error: "Appeal processing failed" },
      { status: 500 },
    )
  }
}
