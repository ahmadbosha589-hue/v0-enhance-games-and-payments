import { NextResponse } from "next/server"

export async function GET() {
  const script = `
// Google PageAd simulation
(function() {
  window.__pagead_loaded = true;
  window.adsbygoogle = window.adsbygoogle || [];
  window.google_ad_client = "ca-pub-0000000000000000";
})();
`

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Ad-Network": "google-pagead",
    },
  })
}
