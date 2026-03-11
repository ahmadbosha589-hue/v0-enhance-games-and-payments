import { NextResponse } from "next/server"
import { logHoneypotProbeRequest, createGIFHoneypotResponse, getHoneypotHeaders } from "@/lib/security/honeypot-logger"

// Generic beacon/tracking endpoint (commonly blocked by adblockers)
export async function GET() {
  // Log that this honeypot was successfully reached
  await logHoneypotProbeRequest("hp_beacon")
  
  return createGIFHoneypotResponse()
}

export async function POST() {
  // Log POST requests too
  await logHoneypotProbeRequest("hp_beacon")
  
  return NextResponse.json(
    { status: "ok", timestamp: Date.now() },
    { headers: getHoneypotHeaders() }
  )
}
