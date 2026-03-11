// 33Across Bait Route - Detects ad network blocking
export async function GET() {
  return new Response(`(function(){var ttd={init:function(){},bid:function(){return{cpm:0.5}}};window.ttd=ttd;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
