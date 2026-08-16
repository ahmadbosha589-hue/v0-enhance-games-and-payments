// Bait route for preroll video ads
export async function GET() {
  const code = `
(function(p,r,e){
  p['PrerollAd']=p['PrerollAd']||{};
  p['PrerollAd'].loaded=true;
  p['PrerollAd'].version='1.0.0';
  p['PrerollAd'].show=function(videoPlayer){
    return Promise.resolve({status:'shown',skippable:true});
  };
})(window,'preroll','ad');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
