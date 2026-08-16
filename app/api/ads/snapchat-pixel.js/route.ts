// Bait route for Snapchat Pixel detection
export const dynamic = "force-dynamic"

export async function GET() {
  const script = `
(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
{a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
a.queue=[];var s='script';r=t.createElement(s);r.async=!0;
r.src=n;var u=t.getElementsByTagName(s)[0];
u.parentNode.insertBefore(r,u);})(window,document,
'https://sc-static.net/scevent.min.js');
snaptr('init', 'test-pixel-id');
snaptr('track', 'PAGE_VIEW');
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
