// One-time, explicitly invoked synchronization. Does not modify Firebase.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import pg from 'pg';
const {Pool}=pg;
const projectId=process.env.FIREBASE_PROJECT_ID;
const credentialJson=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const databaseUrl=process.env.CONTROL_CENTER_DATABASE_URL;
if(projectId!=='zenos-ac6b2'||!credentialJson||!databaseUrl)throw Error('SYNC_CONFIGURATION_MISSING');
if(new URL(databaseUrl).pathname!=='/zenos_control_center_homologacao')throw Error('HOMOLOGATION_DATABASE_REQUIRED');
const credential=JSON.parse(credentialJson);
if(credential.project_id!==projectId)throw Error('PROJECT_MISMATCH');
const app=initializeApp({credential:cert(credential),projectId},'zenos-control-center-sync');
const db=getFirestore(app);
const pool=new Pool({connectionString:databaseUrl,ssl:{rejectUnauthorized:true},max:2});
let cursor=null,scanned=0,inserted=0,updated=0,skipped=0;
const dryRun=process.env.CONTROL_CENTER_SYNC_APPLY!=='true';
try{
  do{
    let query=db.collection('lojas').orderBy(FieldPath.documentId()).limit(100);
    if(cursor)query=query.startAfter(cursor);
    const snap=await query.get();
    if(snap.empty)break;
    const records=[];
    for(const doc of snap.docs){
      const d=doc.data(),name=String(d.nomeLoja||'').trim();
      scanned++;
      if(!name){skipped++;continue;}
      records.push({uid:doc.id,name,country:null});
    }
    if(!dryRun){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        for(const item of records){
          const existing=await client.query('SELECT id FROM organizations WHERE firebase_uid=$1',[item.uid]);
          await client.query(`INSERT INTO organizations(firebase_uid,display_name,country)
            VALUES($1,$2,$3)
            ON CONFLICT(firebase_uid) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()`,[item.uid,item.name,item.country]);
          if(existing.rowCount)updated++;else inserted++;
        }
        await client.query('COMMIT');
      }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
    }
    cursor=snap.docs.at(-1);
    if(snap.size<100)break;
  }while(true);
  console.log(JSON.stringify({source:'lojas',scanned,eligible:scanned-skipped,skipped,inserted,updated,mode:dryRun?'dry-run':'applied'}));
}finally{await pool.end();await deleteApp(app);}
