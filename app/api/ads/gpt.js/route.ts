import { NextResponse } from "next/server"

// Google Publisher Tag-like bait
export async function GET() {
  return new NextResponse(
    `/* Google Publisher Tags */
window.googletag = window.googletag || {cmd: []};
window.googletag.cmd.push(function() {
  window.googletag.pubads().enableSingleRequest();
});
window.__gptAdVerify = Date.now();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
