// Prepared SQL statements; pass a server-only pg pool with parameterized query().
export function createPostgresRepository(pool){
  if(!pool||typeof pool.query!=='function')throw new Error('INVALID_DB_POOL');
  return {
    async listOrganizations({limit=25}={}){
      const safeLimit=Math.max(1,Math.min(100,Number.isInteger(limit)?limit:25));
      const result=await pool.query('SELECT id, firebase_uid, display_name, country, created_at FROM organizations ORDER BY created_at DESC, id DESC LIMIT $1',[safeLimit]);
      return result.rows;
    },
    async getOverview(){
      const results=await pool.query(`SELECT
        (SELECT COUNT(*)::integer FROM organizations) AS organizations,
        (SELECT COUNT(*)::integer FROM subscriptions WHERE status='active') AS active_subscriptions,
        (SELECT COUNT(*)::integer FROM subscriptions WHERE status='trial') AS trials,
        (SELECT COUNT(*)::integer FROM invoices WHERE status='overdue') AS overdue_invoices`);
      return results.rows[0] ?? {organizations:0,active_subscriptions:0,trials:0,overdue_invoices:0};
    }
  };
}
