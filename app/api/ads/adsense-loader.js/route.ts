import { NextResponse } from "next/server"

// AdSense loader-like bait
export async function GET() {
  return new NextResponse(
    `/* AdSense Loader */
(function(a,d,s,e,n,s2,e2){
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.loaded = true;
  window.__adsenseLoaderVerify = Date.now();
})();`,
    {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      },
    },
  )
}
