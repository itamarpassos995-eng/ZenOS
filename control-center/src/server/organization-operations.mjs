// Administrative staging operations. Never changes Firebase or ZenOS production.
export async function ensureOperationsSchema(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS organization_controls (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  administrative_status text NOT NULL DEFAULT 'regular' CHECK(administrative_status IN ('regular','suspended')),
  bonus_days integer NOT NULL DEFAULT 0 CHECK(bonus_days BETWEEN 0 AND 3650),
  internal_note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}
export async function listOrganizationControls(pool){
 const {rows}=await pool.query(`SELECT o.id,o.firebase_uid,o.display_name,o.country,
 COALESCE(c.administrative_status,'regular') administrative_status,
 COALESCE(c.bonus_days,0) bonus_days,COALESCE(c.internal_note,'') internal_note
 FROM organizations o LEFT JOIN organization_controls c ON c.organization_id=o.id
 ORDER BY lower(o.display_name),o.id LIMIT 1000`);
 return rows;
}
export async function updateOrganizationControl(pool,{id,action,days,note,adminSubject}){
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))throw Error('INVALID_ID');
 if(!['suspend','restore','bonus','note'].includes(action))throw Error('INVALID_ACTION');
 if(action==='bonus'&&(!Number.isSafeInteger(days)||days<1||days>365))throw Error('INVALID_BONUS');
 if(action==='note'&&(typeof note!=='string'||note.length>500))throw Error('INVALID_NOTE');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const a=await client.query('SELECT id FROM admin_users WHERE external_subject=$1 AND active=true',[adminSubject]);
  if(a.rowCount!==1)throw Error('ADMIN_NOT_FOUND');
  const o=await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[id]);
  if(o.rowCount!==1)throw Error('ORGANIZATION_NOT_FOUND');
  await client.query('INSERT INTO organization_controls(organization_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
  const before=(await client.query('SELECT administrative_status,bonus_days,internal_note FROM organization_controls WHERE organization_id=$1 FOR UPDATE',[id])).rows[0];
  if(action==='suspend'||action==='restore')await client.query('UPDATE organization_controls SET administrative_status=$2,updated_at=now() WHERE organization_id=$1',[id,action==='suspend'?'suspended':'regular']);
  if(action==='bonus')await client.query('UPDATE organization_controls SET bonus_days=bonus_days+$2,updated_at=now() WHERE organization_id=$1',[id,days]);
  if(action==='note')await client.query('UPDATE organization_controls SET internal_note=$2,updated_at=now() WHERE organization_id=$1',[id,note]);
  const after=(await client.query('SELECT administrative_status,bonus_days,internal_note FROM organization_controls WHERE organization_id=$1',[id])).rows[0];
  await client.query('INSERT INTO audit_events(admin_id,organization_id,action,before_state,after_state) VALUES($1,$2,$3,$4,$5)',[a.rows[0].id,id,'staging.organization.'+action,JSON.stringify(before),JSON.stringify(after)]);
  await client.query('COMMIT');
  return after;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
