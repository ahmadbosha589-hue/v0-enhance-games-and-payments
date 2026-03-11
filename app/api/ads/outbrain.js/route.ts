import { NextResponse } from "next/server"

// Outbrain-like ad network bait
export async function GET() {
  return new NextResponse(
    `/* Outbrain Ad Script */
(function(o,u,t,b,r,a,i,n){
  window.OBR = window.OBR || {};
  window.OBR.extern = {verify: function() { return true; }};
  window.__obAdVerify = Date.now();
})();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
