// Bait endpoint for script blocking detection
import { NextResponse } from "next/server"

export async function GET() {
  const script = `
(function() {
  try {
    window.__scriptTest1Loaded = true;
  } catch(e) {}
})();
`
  return new NextResponse(script.trim(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}
