// Bait route mimicking Chartbeat analytics
export async function GET() {
  const code = `
(function(c,h,b){
  c['Chartbeat']=c['Chartbeat']||{};
  c['Chartbeat'].loaded=true;
  c['Chartbeat'].version='2.0.0';
  c['Chartbeat'].track=function(page){
    return {status:'tracked',page:page};
  };
})(window,'chartbeat','analytics');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
