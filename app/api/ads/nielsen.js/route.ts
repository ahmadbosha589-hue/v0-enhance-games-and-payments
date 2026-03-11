// Bait route mimicking Nielsen analytics
export async function GET() {
  const code = `
(function(n,i,e,l){
  n['Nielsen']=n['Nielsen']||{};
  n['Nielsen'].loaded=true;
  n['Nielsen'].version='8.0.0';
  n['Nielsen'].track=function(event,data){
    return {status:'tracked',event:event};
  };
})(window,'nielsen','dcr','analytics');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
