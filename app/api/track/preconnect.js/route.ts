// Preconnect endpoint
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* preconnect */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}
