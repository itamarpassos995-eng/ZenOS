export function createDistributionClient(user,{fetcher=fetch,now=()=>Date.now()}={}) {
 let session=null;const cache=new Map(),pending=new Map();
 async function post(path,input,signal) {
  const response=await fetcher(`/__distribution/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`,...(session?{'X-Operator-Session':session.sessionToken}:{})},body:JSON.stringify(input),signal,cache:'no-store'});
  const body=await response.json();if(!response.ok||body.error)throw Object.assign(new Error(body.error||'REQUEST_FAILED'),{code:body.error||'REQUEST_FAILED'});return body;
 }
 return {
  async login(operatorId,pin,scope='stock'){session=await post('session',{operatorId,pin,scope});cache.clear();return session;},
  async query(input,{signal,refresh=false}={}){const key=JSON.stringify(input),hit=cache.get(key);if(!refresh&&hit&&now()-hit.at<30000)return structuredClone(hit.value);const value=await post('query',input,signal);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),value});return value;},
  async command(type,loadId,expectedRevision,payload={}){const input={type,loadId,expectedRevision,payload},identity=JSON.stringify(input);if(!pending.has(identity))pending.set(identity,crypto.randomUUID());const result=await post('command',{...input,key:pending.get(identity)});pending.delete(identity);cache.clear();return result;},
  async routeQuery(input,{refresh=false}={}){const key='trip:'+JSON.stringify(input),hit=cache.get(key);if(!refresh&&hit&&now()-hit.at<30000)return structuredClone(hit.value);const value=await post('route-query',input);cache.set(key,{at:now(),value});if(cache.size>64)cache.delete(cache.keys().next().value);return value;},
  async routeCommand(input){const value=await post('route-command',input);cache.clear();return value;},
  async routePost(input){const value=await post('route-post',input);cache.clear();return value;},
  async occurrenceQuery(input,{refresh=false,signal}={}){const key='occ:'+JSON.stringify(input),hit=cache.get(key);if(!refresh&&hit&&now()-hit.at<30000)return structuredClone(hit.value);const value=await post('occurrence-query',input,signal);cache.set(key,{at:now(),value});return value;},
  async occurrenceCommand(type,occurrenceId,expectedRevision,payload={},key=null){const identity='occ:'+JSON.stringify({type,occurrenceId,expectedRevision,payload});if(!pending.has(identity))pending.set(identity,key||crypto.randomUUID());const result=await post('occurrence-command',{type,occurrenceId,expectedRevision,payload,key:pending.get(identity)});pending.delete(identity);cache.clear();return result;},
  invalidate(){cache.clear();},
  async logout(){await post('logout',{});session=null;cache.clear();pending.clear();},
  clear(){session=null;cache.clear();pending.clear();},
 };
}
