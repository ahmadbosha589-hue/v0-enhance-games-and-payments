// Bait route mimicking comScore analytics
export async function GET() {
  const code = `
(function(c,s,m){
  c['COMSCORE']=c['COMSCORE']||{};
  c['COMSCORE'].loaded=true;
  c['COMSCORE'].beacon=function(config){
    return {status:'sent',c1:config.c1,c2:config.c2};
  };
})(window,'comscore','analytics');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
