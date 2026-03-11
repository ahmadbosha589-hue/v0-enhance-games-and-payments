export async function GET() {
  const jsContent = `
    // Ad initialization script
    (function() {
      window.__ads_loaded = true;
      window.__ad_timestamp = Date.now();
    })();
  `

  return new Response(jsContent, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
