import {assertAdminAccess} from '../domain/admin-access.mjs';
const json=(status,body)=>({status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body});
export function createAdminApi({verifySession,repository}){
  if(typeof verifySession!=='function'||!repository)throw new Error('MISSING_SERVER_DEPENDENCIES');
  return async function handle({method='GET',path='/',headers={}}){
    if(method!=='GET') return json(405,{error:'METHOD_NOT_ALLOWED'});
    if(!['/health','/api/organizations','/api/overview'].includes(path))return json(404,{error:'NOT_FOUND'});
    if(path==='/health')return json(200,{status:'ok',service:'zenos-control-center'});
    let session;
    try{session=await verifySession(headers);}catch{return json(401,{error:'UNAUTHENTICATED'})}
    if(!session)return json(401,{error:'UNAUTHENTICATED'});
    try{assertAdminAccess(session,'organizations:read')}catch{return json(403,{error:'FORBIDDEN'})}
    try{
      if(path==='/api/overview')return json(200,await repository.getOverview());
      const organizations=await repository.listOrganizations({limit:25});
      return json(200,{organizations});
    }catch{return json(503,{error:'SERVICE_UNAVAILABLE'})}
  }
}
