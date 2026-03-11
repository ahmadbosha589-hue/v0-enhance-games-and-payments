// =============================================================================
// UNIQUE PROBE HANDLER
// Handles one-time unique probe URLs
// =============================================================================

import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Return minimal response for unique probes
  return new NextResponse("1", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "X-Probe-Type": "unique",
    },
  })
}
