// Node HTTP adapter for staging only. NOT a deployed endpoint.
// All private endpoints pass through createAdminApi session validation.
export function createNodeHttpHandler(handle){
  if(typeof handle!=='function')throw new Error('HANDLER_REQUIRED');
  return async (req,res)=>{
    const path=new URL(req.url||'/', 'http://localhost').pathname;
    let result;
    try{result=await handle({method:req.method,path,headers:req.headers});}
    catch{result={status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:{error:'SERVICE_UNAVAILABLE'}};}
    res.writeHead(result.status,{...result.headers,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
    res.end(JSON.stringify(result.body));
  };
}
