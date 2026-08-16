// =============================================================================
// TIME-ROTATED AD-ROUTE HANDLER
// Handles time-based rotating routes
// =============================================================================

import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ category: string; hash: string }> }) {
  const { category, hash } = await params

  // Return a valid response
  const response = new NextResponse(`/* time-rotated: ${category} */`, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Probe-Type": "time-rotated",
      "X-Category": category,
    },
  })

  return response
}
