export function createDistributionClient(user,{fetcher=fetch,now=()=>Date.now()}={}) {
 let session=null;const cache=new Map(),pending=new Map();
 async function post(path,input,signal) {
  const response=await fetcher(`/__distribution/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`,...(session?{'X-Operator-Session':session.sessionToken}:{})},body:JSON.stringify(input),signal,cache:'no-store'});
  const body=await response.json();if(!response.ok||body.error)throw Object.assign(new Error(body.error||'REQUEST_FAILED'),{code:body.error||'REQUEST_FAILED'});return body;
 }
 return {
  async login(operatorId,pin){session=await post('session',{operatorId,pin});cache.clear();return session;},
  async query(input,{signal,refresh=false}={}){const key=JSON.stringify(input),hit=cache.get(key);if(!refresh&&hit&&now()-hit.at<30000)return structuredClone(hit.value);const value=await post('query',input,signal);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),value});return value;},
  async command(type,loadId,expectedRevision,payload={}){const input={type,loadId,expectedRevision,payload},identity=JSON.stringify(input);if(!pending.has(identity))pending.set(identity,crypto.randomUUID());const result=await post('command',{...input,key:pending.get(identity)});pending.delete(identity);cache.clear();return result;},
  invalidate(){cache.clear();},
  async logout(){await post('logout',{});session=null;cache.clear();pending.clear();},
  clear(){session=null;cache.clear();pending.clear();},
 };
}
