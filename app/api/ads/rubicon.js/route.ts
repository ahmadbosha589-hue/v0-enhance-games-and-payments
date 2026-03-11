// Bait route mimicking Rubicon Project (Magnite)
export async function GET() {
  const code = `
(function(r,p,m){
  r['Rubicon']=r['Rubicon']||{};
  r['Rubicon'].loaded=true;
  r['Rubicon'].version='2.0.0';
  r['Rubicon'].requestBids=function(config){
    return Promise.resolve({bids:[],status:'complete'});
  };
})(window,'rubicon','magnite');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
