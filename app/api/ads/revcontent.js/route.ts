import { NextResponse } from "next/server"

// Revcontent-like ad network bait
export async function GET() {
  return new NextResponse(
    `/* Revcontent Ad Script */
window.revcontentQueue = window.revcontentQueue || [];
window.revcontentQueue.push({widgetId: 0});
window.__revcontentAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
