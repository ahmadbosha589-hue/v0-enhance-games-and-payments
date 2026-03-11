import { logHoneypotProbeRequest, createJSHoneypotResponse } from "@/lib/security/honeypot-logger"

export async function GET() {
  // Log that this honeypot was successfully reached
  await logHoneypotProbeRequest("hp_adsense")
  
  return createJSHoneypotResponse("adsense")
}
