// Worker probe endpoint - track variant
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* worker probe track */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}
