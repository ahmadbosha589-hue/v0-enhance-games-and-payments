import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 3

/**
 * Receives browser CSP report-only notifications.
 *
 * Reports are deliberately sampled and reduced to a small safe diagnostic
 * shape; the full document URL and raw JSON are not persisted or logged.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const report = body?.["csp-report"]
    const source = report && typeof report === "object"
      ? report as Record<string, unknown>
      : body

    if (Math.random() < 0.1 && source) {
      console.warn("[CSP] report-only violation", {
        directive: typeof source["violated-directive"] === "string" ? source["violated-directive"] : undefined,
        blocked: typeof source["blocked-uri"] === "string" ? source["blocked-uri"] : undefined,
        disposition: typeof source.disposition === "string" ? source.disposition : undefined,
      })
    }
  } catch {
    // CSP reports are best-effort telemetry; malformed reports are ignored.
  }

  return new NextResponse(null, { status: 204 })
}
