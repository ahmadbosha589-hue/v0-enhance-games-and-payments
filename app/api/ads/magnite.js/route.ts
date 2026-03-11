// Magnite Bait Route - Detects SSP blocking
export async function GET() {
  return new Response(`(function(){var magnite={init:function(){},auction:function(){}};window.magnite=magnite;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
