import { NextResponse } from "next/server"

// Simple ping endpoint for network baseline calibration
// This should never be blocked by adblockers

export async function GET() {
  return new NextResponse("pong", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}
