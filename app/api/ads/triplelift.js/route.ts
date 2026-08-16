// Bait route mimicking TripleLift native advertising
export async function GET() {
  const code = `
(function(t,l,n){
  t['TripleLift']=t['TripleLift']||{};
  t['TripleLift'].loaded=true;
  t['TripleLift'].version='3.0.0';
  t['TripleLift'].renderAd=function(container,creative){
    return {status:'rendered',container:container};
  };
})(window,'triplelift','native');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
