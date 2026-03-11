import { NextResponse } from "next/server"

// 1x1 transparent GIF as base64
const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

export async function GET() {
  // Return a tiny transparent GIF that adblockers will try to block
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Ad-Marker": "true",
    },
  })
}
