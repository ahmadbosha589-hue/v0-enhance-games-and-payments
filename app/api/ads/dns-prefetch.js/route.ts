// DNS prefetch endpoint
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* dns prefetch */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}
