import { NextResponse } from "next/server"

// Moat analytics bait (commonly blocked)
export async function GET() {
  return new NextResponse(
    `/* Moat Analytics */
window.moatYieldReady = window.moatYieldReady || [];
window.moat_init = function() { return true; };
window.__moatAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
