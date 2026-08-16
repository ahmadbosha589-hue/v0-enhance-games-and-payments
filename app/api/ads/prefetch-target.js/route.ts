// Prefetch target endpoint
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* prefetch target */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}
