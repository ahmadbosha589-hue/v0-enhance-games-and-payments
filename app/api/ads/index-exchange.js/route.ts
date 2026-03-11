// Bait route mimicking Index Exchange
export async function GET() {
  const code = `
(function(i,x,c){
  i['IndexExchange']=i['IndexExchange']||{};
  i['IndexExchange'].loaded=true;
  i['IndexExchange'].version='3.0.0';
  i['IndexExchange'].getBids=function(slots){
    return Promise.resolve({bids:[],slots:slots});
  };
})(window,'indexexchange','casale');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
