// Bait route for Pinterest Tag detection
export const dynamic = "force-dynamic"

export async function GET() {
  const script = `
!function(e){if(!window.pintrk){window.pintrk = function () {
window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
n=window.pintrk;n.queue=[],n.version="3.0";var
t=document.createElement("script");t.async=!0,t.src=e;var
r=document.getElementsByTagName("script")[0];
r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
pintrk('load', 'test-tag-id');
pintrk('page');
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
