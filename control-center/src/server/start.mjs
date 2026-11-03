import {migrateOperations} from './migrations.mjs';
import {createSaasService} from './saas-service.mjs';
import {createIntegration} from './integration.mjs';
import {ensureOperationsSchema,listOrganizationControls} from './organization-operations.mjs';
import {createServer} from 'node:http';
import {createDatabasePool} from './database.mjs';
import {createGoogleIdentityVerifier} from './google-identity.mjs';
import {createSecretBox,createAuthStore} from './auth-store.mjs';
import {createSessionVerifier} from './session.mjs';
import {createPostgresRepository} from '../api/postgres-repository.mjs';
import {createAdminApi} from '../api/http.mjs';
import {createAuthHttp} from './auth-http.mjs';
const env=process.env;
// Deliberate allowlist: this runtime must never point at an operational database.
if(new URL(env.CONTROL_CENTER_DATABASE_URL||'postgresql://invalid/').pathname!=='/zenos_control_center_homologacao')throw Error('HOMOLOGATION_DATABASE_REQUIRED');
const box=createSecretBox(env.CONTROL_CENTER_AUTH_KEY);
const verifyGoogle=createGoogleIdentityVerifier({clientId:env.GOOGLE_CLIENT_ID});
const pool=await createDatabasePool({requireTls:true});
const store=createAuthStore({pool,box,bootstrapEmail:env.CONTROL_CENTER_BOOTSTRAP_EMAIL});
const verifySession=createSessionVerifier({verifyProviderToken:token=>store.verifySession(token)});
const handleApi=createAdminApi({verifySession,repository:createPostgresRepository(pool)});
const saas=createSaasService(pool);
const integration=createIntegration({pool,secret:env.CONTROL_CENTER_INTEGRATION_SECRET,origin:env.CONTROL_CENTER_INTEGRATION_ORIGIN,enabled:env.CONTROL_CENTER_INTEGRATION_ENABLED==='true'});
const handle=createAuthHttp({store,verifyGoogle,handleApi,origin:env.CONTROL_CENTER_ORIGIN,
  clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,
  saas,integration,operations:{list:args=>listOrganizationControls(pool,args)}});
// Fail before listening when authentication migrations have not been applied.
await pool.query('SELECT token_hash FROM admin_sessions LIMIT 0');
await pool.query('SELECT secret_cipher,enabled FROM admin_mfa_state LIMIT 0');
await store.cleanup();
await ensureOperationsSchema(pool);
await migrateOperations(pool);
await saas.recurring();
// Conservative process-wide limiter: never trusts spoofable X-Forwarded-For.
let windowStart=Date.now(),requests=0;
const server=createServer(async(req,res)=>{
  try{
    if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}
    if(++requests>120){res.writeHead(429,{'retry-after':'60','cache-control':'no-store'});res.end();return;}
    let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>4096){res.writeHead(413);res.end();return;}}
    const result=await handle({method:req.method,url:req.url,headers:req.headers,body});
    res.writeHead(result.status,{'cache-control':'no-store','x-content-type-options':'nosniff',...result.headers});res.end(result.body);
  }catch{res.writeHead(503,{'cache-control':'no-store'});res.end('Serviço indisponível');}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(env.PORT||3000),env.CONTROL_CENTER_BIND||'127.0.0.1',()=>console.log('Control Center homologation listening'));
let jobRunning=false;
const jobs=setInterval(async()=>{if(jobRunning)return;jobRunning=true;try{await integration.dispatch();}catch{console.error('Integration job failed');}finally{jobRunning=false;}},30000);jobs.unref();
const billing=setInterval(()=>saas.recurring().catch(()=>console.error('Billing job failed')),3600000);billing.unref();
const cleanup=setInterval(()=>store.cleanup().catch(()=>{}),300000);cleanup.unref();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{clearInterval(cleanup);clearInterval(jobs);clearInterval(billing);server.close(()=>pool.end().finally(()=>process.exit(0)));});
