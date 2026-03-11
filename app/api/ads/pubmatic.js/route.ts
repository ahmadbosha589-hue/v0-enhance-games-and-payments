// Bait route mimicking PubMatic
export async function GET() {
  const code = `
(function(p,m,t){
  p['PubMatic']=p['PubMatic']||{};
  p['PubMatic'].loaded=true;
  p['PubMatic'].version='3.0.0';
  p['PubMatic'].bid=function(adUnit){
    return Promise.resolve({bid:null,adUnit:adUnit});
  };
})(window,'pubmatic','header');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
