export function createDistributionHandler({auth:authClient,service,attachments=true,staging=false}){
 return async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
  const path=req.url;
  if(!attachments&&path?.startsWith('/occurrence-evidence-')){res.writeHead(404);res.end('{}');return;}
  if(req.method!=='POST'||!['/session','/command','/query','/logout','/finalize','/route-command','/route-query','/route-post','/occurrence-command','/occurrence-query','/occurrence-evidence-upload','/occurrence-evidence-read','/occurrence-evidence-invalidate','/adjustment-command','/adjustment-query','/reconciliation-command','/reconciliation-query'].includes(path)){res.writeHead(404);res.end('{}');return;}
  // Served through the Vite same-origin proxy; no permissive CORS or cookie auth.
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!bearer)throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
  const auth=await authClient.verifyIdToken(bearer,true);
  if(auth.firebase?.sign_in_provider==='anonymous')throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
  if(staging&&path==='/finalize')throw Object.assign(new Error('PILOT_PYG_CREDIT_UNAVAILABLE'),{code:'PILOT_PYG_CREDIT_UNAVAILABLE'});
  let raw=typeof req.body==='string'?req.body:req.body===undefined?'':JSON.stringify(req.body);if(req.body===undefined)for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>(path==='/occurrence-evidence-upload'?1_500_000:130000))throw Object.assign(new Error('REQUEST_TOO_LARGE'),{code:'REQUEST_TOO_LARGE'});}
  if(Buffer.byteLength(raw)>(path==='/occurrence-evidence-upload'?1_500_000:130000))throw Object.assign(new Error('REQUEST_TOO_LARGE'),{code:'REQUEST_TOO_LARGE'});
  const input=JSON.parse(raw||'{}');
  if(staging&&path==='/route-query'&&input.type==='delivery-c-acceptance'){
   const result=await service.verifyDeliveryCAcceptance(auth,String(req.headers['x-operator-session']||''));
   res.end(JSON.stringify(result));return;
  }
  const result=path.startsWith('/reconciliation-')?await service[path==='/reconciliation-command'?'reconciliationCommand':'reconciliationQuery'](auth.uid,String(req.headers['x-operator-session']||''),input):path.startsWith('/adjustment-')?await service[path==='/adjustment-command'?'adjustmentCommand':'adjustmentQuery'](auth.uid,String(req.headers['x-operator-session']||''),input):path.startsWith('/occurrence-')?await service[{'/occurrence-command':'occurrenceCommand','/occurrence-query':'occurrenceQuery','/occurrence-evidence-upload':'occurrenceEvidenceUpload','/occurrence-evidence-read':'occurrenceEvidenceRead','/occurrence-evidence-invalidate':'occurrenceEvidenceInvalidate'}[path]](auth.uid,String(req.headers['x-operator-session']||''),input):path==='/session'?await service.login(auth.uid,input):path==='/finalize'?await service.finalize(auth.uid,input):path.startsWith('/route-')?await service[{'/route-command':'routeCommand','/route-query':'routeQuery','/route-post':'routePost'}[path]](auth.uid,String(req.headers['x-operator-session']||''),input):await service[path==='/command'?'command':path==='/logout'?'logout':'query'](auth.uid,String(req.headers['x-operator-session']||''),input);
  res.end(JSON.stringify(result));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:typeof e.code==='string'&&!e.code.startsWith('auth/')?e.code:'UNAUTHENTICATED'}));}
 };
}
