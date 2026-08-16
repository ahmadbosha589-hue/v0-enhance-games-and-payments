import { NextResponse } from "next/server"

// Taboola-like ad network bait
export async function GET() {
  return new NextResponse(
    `/* Taboola Ad Script */
(function(t,a,b,o,l,a2){
  window._taboola = window._taboola || [];
  window._taboola.push({article:'auto'});
  window.__tblAdVerify = Date.now();
})();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
