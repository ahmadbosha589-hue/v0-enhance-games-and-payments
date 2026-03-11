import { NextResponse } from "next/server"

// Analytics collection endpoint (commonly blocked path)
export async function GET() {
  return NextResponse.json({
    status: "ok",
    collect: true,
    timestamp: Date.now(),
  })
}

export async function POST() {
  return NextResponse.json({
    status: "ok",
    collected: true,
    timestamp: Date.now(),
  })
}
