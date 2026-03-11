// Bait route for Reddit Pixel detection
export const dynamic = "force-dynamic"

export async function GET() {
  const script = `
!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
rdt('init','test_pixel_id');
rdt('track', 'PageVisit');
`.trim()

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}

export async function HEAD() {
  return new Response(null, { status: 200 })
}
