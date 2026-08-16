// Preload Test Bait Route - Tests preload hint blocking
export async function GET() {
  return new Response(`(function(){window.__preload_test_loaded=true;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
