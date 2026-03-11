import { NextResponse } from "next/server"

// Criteo-like ad network bait
export async function GET() {
  return new NextResponse(
    `/* Criteo Ad Script */
window.criteo_q = window.criteo_q || [];
window.criteo_q.push({event: "viewHome"});
window.__criteoAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
