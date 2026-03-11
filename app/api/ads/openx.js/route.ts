// Bait route mimicking OpenX
export async function GET() {
  const code = `
(function(o,x,b){
  o['OpenX']=o['OpenX']||{};
  o['OpenX'].loaded=true;
  o['OpenX'].version='3.0.0';
  o['OpenX'].requestAd=function(adUnit){
    return Promise.resolve({ad:null,status:'complete'});
  };
})(window,'openx','bidding');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
