// Server-only PostgreSQL connection. No connection at import time and no browser access.
export async function createDatabasePool({connectionString=process.env.CONTROL_CENTER_DATABASE_URL,pgModule,requireTls=false}={}){
  if(!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) throw new Error('DATABASE_NOT_CONFIGURED');
  const url=new URL(connectionString);
  if(requireTls || process.env.CONTROL_CENTER_DB_SSL === 'require'){
    for(const key of ['sslmode','ssl','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  }
  const pg=pgModule || await import('pg');
  return new pg.Pool({connectionString:url.toString(),max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,ssl: (requireTls || process.env.CONTROL_CENTER_DB_SSL === 'require') ? {rejectUnauthorized:true}:undefined});
}
export async function databaseHealth(pool){
  const {rows}=await pool.query('SELECT 1 AS ok');
  return rows?.[0]?.ok===1;
}
