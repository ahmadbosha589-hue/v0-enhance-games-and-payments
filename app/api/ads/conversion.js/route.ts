import { NextResponse } from "next/server"

export async function GET() {
  // Return a valid JavaScript response
  const js = `(function(){window.__adConversion=true;})();`
  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}
