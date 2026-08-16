// Bait route mimicking VPAID video ad interface
export async function GET() {
  const code = `
(function(v,p,a,i,d){
  v['VPAID']=v['VPAID']||{};
  v['VPAID'].loaded=true;
  v['VPAID'].version='2.0';
  v['VPAID'].getVPAIDAd=function(){
    return {
      handshakeVersion:function(){return '2.0';},
      initAd:function(){},
      startAd:function(){},
      stopAd:function(){},
      skipAd:function(){},
      resizeAd:function(){},
      pauseAd:function(){},
      resumeAd:function(){},
      expandAd:function(){},
      collapseAd:function(){},
      subscribe:function(){},
      unsubscribe:function(){}
    };
  };
})(window,'vpaid','video','ad','interface');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
