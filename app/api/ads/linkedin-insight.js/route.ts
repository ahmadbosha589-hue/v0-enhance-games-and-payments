// Bait route for LinkedIn Insight detection
export const dynamic = "force-dynamic"

export async function GET() {
  const script = `
_linkedin_partner_id = "1234567";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
(function(){var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})();
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
