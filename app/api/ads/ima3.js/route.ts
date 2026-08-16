import { NextResponse } from "next/server"

// Google IMA (Video Ads) bait
export async function GET() {
  return new NextResponse(
    `/* Google IMA SDK */
window.google = window.google || {};
window.google.ima = window.google.ima || {
  AdsLoader: function() {},
  AdDisplayContainer: function() {}
};
window.__imaAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
