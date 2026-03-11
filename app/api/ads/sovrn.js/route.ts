// Bait route mimicking Sovrn
export async function GET() {
  const code = `
(function(s,v,n){
  s['Sovrn']=s['Sovrn']||{};
  s['Sovrn'].loaded=true;
  s['Sovrn'].version='2.0.0';
  s['Sovrn'].loadAd=function(config){
    return {status:'loaded',placement:config.placement};
  };
})(window,'sovrn','ads');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
