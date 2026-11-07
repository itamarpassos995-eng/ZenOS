import test from 'node:test';
import assert from 'node:assert/strict';
import {createDistributionClient} from '../../src/core/distribution/client.js';
const user={getIdToken:async()=>'synthetic-token'};
test('occurrence lost response retries exact command and idempotency key',async()=>{
 let attempts=0;const calls=[];
 const fetcher=async (path,options)=>{
  if(!path.endsWith('/occurrence-command'))throw Error('UNEXPECTED_PATH');
  const data=JSON.parse(options.body);calls.push(data);
  if(attempts++===0)throw new Error('NETWORK_LOST_AFTER_COMMIT');
  return {ok:true,json:async()=>({occurrenceId:'OCC1',revision:0})};
 };
 const client=createDistributionClient(user,{fetcher});
 const payload={id:'OCC1',reason:'DAMAGED',quantity:1};
 await assert.rejects(client.occurrenceCommand('CREATE','OCC1',0,payload));
 const r=await client.occurrenceCommand('CREATE','OCC1',0,payload);
 assert.equal(r.revision,0);assert.equal(calls.length,2);
 assert.equal(calls[0].key,calls[1].key);
 assert.deepEqual(calls[0],calls[1]);
});
test('occurrence command never presents false success when remote rejects',async()=>{
 const client=createDistributionClient(user,{fetcher:async()=>({ok:false,json:async()=>({error:'FORBIDDEN'})})});
 await assert.rejects(client.occurrenceCommand('DRAFT_FISCAL','OCC1',1,{}),{code:'FORBIDDEN'});
});
