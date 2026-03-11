// Bait route mimicking AppNexus (Xandr)
export async function GET() {
  const code = `
(function(a,n,x){
  a['AppNexus']=a['AppNexus']||{};
  a['AppNexus'].loaded=true;
  a['AppNexus'].version='4.0.0';
  a['AppNexus'].defineTag=function(config){
    return {tagId:config.tagId,status:'defined'};
  };
})(window,'appnexus','xandr');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
