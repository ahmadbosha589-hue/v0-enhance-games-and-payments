// Bait route mimicking Sharethrough native ads
export async function GET() {
  const code = `
(function(s,t,r){
  s['Sharethrough']=s['Sharethrough']||{};
  s['Sharethrough'].loaded=true;
  s['Sharethrough'].version='4.0.0';
  s['Sharethrough'].insertAd=function(config){
    return Promise.resolve({status:'inserted',placement:config.placement});
  };
})(window,'sharethrough','native');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
