// Bait route mimicking Zergnet recommendation widget
export async function GET() {
  const code = `
(function(z,e,r,g){
  z['Zergnet']=z['Zergnet']||{};
  z['Zergnet'].loaded=true;
  z['Zergnet'].version='2.0.0';
  z['Zergnet'].render=function(containerId,options){
    return {status:'rendered',container:containerId};
  };
})(window,'zergnet','widget','recommendations');
`.trim()

  return new Response(code, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
