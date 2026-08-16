// Teads Bait Route - Detects video ad blocking
export async function GET() {
  return new Response(`(function(){var teads={init:function(){},requestAd:function(){}};window.teads=teads;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
