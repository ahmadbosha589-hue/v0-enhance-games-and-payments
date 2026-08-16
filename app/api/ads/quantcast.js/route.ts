import { NextResponse } from "next/server"

// Quantcast-like bait (commonly blocked)
export async function GET() {
  return new NextResponse(
    `/* Quantcast Measurement */
window.__qc = window.__qc || {};
window.__qc.qcdata = window.__qc.qcdata || {};
window._qevents = window._qevents || [];
window.__quantcastAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
