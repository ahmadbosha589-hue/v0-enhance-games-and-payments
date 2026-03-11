// Bait route for generic video advertising
export async function GET() {
  const code = `
(function(v,i,d,e,o){
  v['VideoAd']=v['VideoAd']||{};
  v['VideoAd'].loaded=true;
  v['VideoAd'].version='1.0.0';
  v['VideoAd'].play=function(container,options){
    return Promise.resolve({status:'playing',container:container});
  };
})(window,'video','ad','player','sdk');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
