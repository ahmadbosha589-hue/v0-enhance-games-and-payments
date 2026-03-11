import { NextResponse } from "next/server"

// Media.net-like ad network bait
export async function GET() {
  return new NextResponse(
    `/* Media.net Ad Script */
window._mNHandle = window._mNHandle || {};
window._mNHandle.queue = window._mNHandle.queue || [];
window.__mediaNetAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
