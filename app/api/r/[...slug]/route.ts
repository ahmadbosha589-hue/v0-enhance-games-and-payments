// =============================================================================
// ROTATING AD-ROUTE HANDLER
// Handles all dynamically generated rotating routes
// =============================================================================

import { NextResponse } from "next/server"
import { isValidRotatedRoute } from "@/lib/adblock/rotating-routes"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = `/api/r/${slug.join("/")}`

  // Validate this is a legitimate rotated route
  if (!isValidRotatedRoute(path)) {
    return new NextResponse(null, { status: 404 })
  }

  // Return a valid response to indicate the route wasn't blocked
  const response = new NextResponse("/* rotated bait */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Probe-Type": "rotating",
    },
  })

  return response
}

export async function POST(request: Request) {
  // Handle beacon-style POST requests
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
