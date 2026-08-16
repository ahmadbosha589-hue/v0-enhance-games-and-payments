import { NextResponse } from "next/server"

export async function GET() {
  const js = `(function(){window.__advertisement=true;})();`
  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}
