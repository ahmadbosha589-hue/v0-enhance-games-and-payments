// Bait route mimicking MGID native advertising
export async function GET() {
  const code = `
(function(m,g,i,d){
  m['MGID']=m['MGID']||{};
  m['MGID'].loaded=true;
  m['MGID'].version='3.0.0';
  m['MGID'].widgets={};
  m['MGID'].init=function(config){
    return new Promise(function(resolve){
      setTimeout(function(){
        resolve({status:'ready',widgetId:config.widgetId});
      },100);
    });
  };
})(window,'mgid','widget','native');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
