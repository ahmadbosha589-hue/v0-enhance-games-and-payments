import { logHoneypotProbeRequest, createGIFHoneypotResponse } from "@/lib/security/honeypot-logger"

export async function GET() {
  // Log that this honeypot was successfully reached
  await logHoneypotProbeRequest("hp_pixel")
  
  return createGIFHoneypotResponse()
}
