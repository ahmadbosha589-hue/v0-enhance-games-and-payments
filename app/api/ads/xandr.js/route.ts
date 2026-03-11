// Xandr Bait Route - Detects programmatic ad blocking
export async function GET() {
  return new Response(`(function(){var xandr={init:function(){},requestBid:function(){}};window.xandr=xandr;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
