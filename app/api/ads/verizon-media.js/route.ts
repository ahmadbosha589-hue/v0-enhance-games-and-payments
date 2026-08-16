// Verizon Media Bait Route - Detects ad network blocking
export async function GET() {
  return new Response(`(function(){var vzm={init:function(){},getAd:function(){}};window.vztag=vzm;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
