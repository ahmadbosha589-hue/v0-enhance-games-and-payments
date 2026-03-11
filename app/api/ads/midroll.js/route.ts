// Bait route for midroll video ads
export async function GET() {
  const code = `
(function(m,i,d){
  m['MidrollAd']=m['MidrollAd']||{};
  m['MidrollAd'].loaded=true;
  m['MidrollAd'].version='1.0.0';
  m['MidrollAd'].insert=function(videoPlayer,timestamp){
    return Promise.resolve({status:'inserted',timestamp:timestamp});
  };
})(window,'midroll','ad');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
