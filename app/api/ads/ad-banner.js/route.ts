// This file serves as a bait for adblock detection
// If adblockers block this request, we know they're active

import { NextResponse } from "next/server"

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function GET() {
  // Return JS that sets the canRunAds flag
  // This script will be blocked by adblockers due to the filename containing "ad"
  const script = `
(function() {
  try {
    window.canRunAds = true;
    window.__adCheckLoaded = true;
  } catch(e) {}
})();
`

  return new NextResponse(script.trim(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
