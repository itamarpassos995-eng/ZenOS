import {normalizeIncomingEvent} from '../domain/event-envelope.mjs';

// Server-only transactional inbox. The caller authenticates the producer and
// supplies verified UID before reaching this function.
export async function processCommercialEvent({pool,input,verifiedSource,verifiedOrganizationUid}){
  if(!pool || typeof pool.connect!=='function') throw Error('POOL_REQUIRED');
  const event=normalizeIncomingEvent(input,{verifiedSource,verifiedOrganizationUid});
  const client=await pool.connect();
  let begun=false;
  try{
    await client.query('BEGIN');begun=true;
    const inserted=await client.query(
      'INSERT INTO inbox_events (event_id,event_type,organization_uid,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [event.eventId,event.eventType,event.organizationUid,JSON.stringify(event.payload)]
    );
    if(inserted.rowCount===0){await client.query('COMMIT');begun=false;return {duplicate:true,processed:false};}
    if(event.eventType==='organization.registered.v1'){
      await client.query(
        `INSERT INTO organizations (firebase_uid,display_name,country,last_synced_at,source_updated_at) VALUES ($1,$2,$3,now(),$4)
         ON CONFLICT (firebase_uid) DO UPDATE SET display_name=EXCLUDED.display_name,country=EXCLUDED.country,updated_at=now(),last_synced_at=now(),source_updated_at=EXCLUDED.source_updated_at WHERE organizations.source_updated_at IS NULL OR organizations.source_updated_at<EXCLUDED.source_updated_at`,
        [event.organizationUid,event.payload.displayName.trim(),event.payload.country||null,event.occurredAt]
      );
    }else if(event.eventType==='commercial.requested.v1'){
      const saved=await client.query(
        `INSERT INTO commercial_requests (organization_id,request_type,idempotency_key)
         SELECT id,$2,$3 FROM organizations WHERE firebase_uid=$1
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [event.organizationUid,event.payload.requestType,event.eventId]
      );
      if(saved.rowCount===0) throw Error('ORGANIZATION_NOT_READY');
    }else if(event.eventType==='trial.started.v1'){
      // Trial duration remains governed by the existing ZenOS logic. Do not
      // invent a billing deadline or grant paid features from an event.
      const found=await client.query('SELECT id FROM organizations WHERE firebase_uid=$1',[event.organizationUid]);
      if(found.rowCount===0)throw Error('ORGANIZATION_NOT_READY');
    }
    await client.query('UPDATE inbox_events SET processed_at=now() WHERE event_id=$1',[event.eventId]);
    await client.query('COMMIT');begun=false;
    return {duplicate:false,processed:true};
  }catch(error){if(begun)await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release();}
}
