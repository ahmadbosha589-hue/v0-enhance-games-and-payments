import { NextResponse } from "next/server"

export async function GET() {
  const script = `
// Amazon Ad System simulation
(function() {
  window.__amazon_ads_loaded = true;
  window.amzn_assoc_tracking_id = "test-20";
})();
`

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Ad-Network": "amazon",
    },
  })
}
