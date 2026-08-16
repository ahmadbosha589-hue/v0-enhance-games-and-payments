// CSP Test Bait Route - Tests Content Security Policy blocking
export async function GET() {
  return new Response(`(function(){window.__csp_test_loaded=true;})();`, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
