import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Only new, versioned migrations. Never run 001/002/003 from runtime.
export async function migrateOperations(pool){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('CREATE TABLE IF NOT EXISTS control_center_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await c.query('LOCK TABLE control_center_migrations IN EXCLUSIVE MODE');
  for(const version of ['004_saas_operations.sql']){
   const sql=await readFile(new URL('../../migrations/'+version,import.meta.url),'utf8');
   const checksum=createHash('sha256').update(sql).digest('hex');
   const old=(await c.query('SELECT checksum FROM control_center_migrations WHERE version=$1',[version])).rows[0];
   if(old){if(old.checksum!==checksum)throw Error('MIGRATION_CHECKSUM_MISMATCH');continue;}
   await c.query(sql);await c.query('INSERT INTO control_center_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
