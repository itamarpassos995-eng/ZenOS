import {createDatabasePool} from './database.mjs';
import {createSessionVerifier} from './session.mjs';
import {createPostgresRepository} from '../api/postgres-repository.mjs';
import {createAdminApi} from '../api/http.mjs';
// Bootstraps only after caller explicitly provides a real, server-verified identity adapter.
export async function bootstrapControlCenter({verifyProviderToken,connectionString,pgModule}={}){
  const verifySession=createSessionVerifier({verifyProviderToken});
  const pool=await createDatabasePool({connectionString,pgModule});
  const repository=createPostgresRepository(pool);
  return {handle:createAdminApi({verifySession,repository}),close:()=>pool.end()};
}
