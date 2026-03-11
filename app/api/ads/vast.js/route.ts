// Bait route mimicking VAST video ad standard
export async function GET() {
  const code = `
(function(v,a,s,t){
  v['VAST']=v['VAST']||{};
  v['VAST'].loaded=true;
  v['VAST'].version='4.0';
  v['VAST'].parse=function(xml){
    return {ads:[],status:'parsed'};
  };
  v['VAST'].loadAd=function(url){
    return Promise.resolve({status:'loaded',url:url});
  };
})(window,'vast','video','ad');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
