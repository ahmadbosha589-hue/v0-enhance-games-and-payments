import { logHoneypotProbeRequest, createJSHoneypotResponse, getHoneypotHeaders } from "@/lib/security/honeypot-logger"

export async function GET() {
  // Log that this honeypot was successfully reached
  await logHoneypotProbeRequest("hp_analytics")
  
  return createJSHoneypotResponse("analytics_loader")
}

export async function HEAD() {
  // Log HEAD requests too
  await logHoneypotProbeRequest("hp_analytics")
  
  return new Response(null, {
    status: 200,
    headers: {
      ...getHoneypotHeaders(),
      "Content-Type": "application/javascript",
    },
  })
}
