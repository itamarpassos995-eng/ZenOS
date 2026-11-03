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
export async function listOrganizationControls(pool,{q='',page=1,pageSize=25,country='',status='',sort='name'}={}){
 const search=String(q).trim().slice(0,120);
 const p=Number.isSafeInteger(page)?Math.max(1,Math.min(page,100000)):1;
 const size=Number.isSafeInteger(pageSize)?Math.max(1,Math.min(pageSize,100)):25;
 const countryFilter=/^[A-Z]{2}$/.test(country)?country:'';
 const statusFilter=['trial','active','past_due','grace','suspended','canceled'].includes(status)?status:'';
 const order={name:'lower(o.display_name),o.id',newest:'o.created_at DESC,o.id',oldest:'o.created_at,o.id'}[sort]||'lower(o.display_name),o.id';
 const filterSQL=" AND ($2='' OR o.country=$2) AND ($3='' OR EXISTS(SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id AND s.status=$3))";
 const where="WHERE ($1 = '' OR o.display_name ILIKE '%' || $1 || '%' OR o.firebase_uid ILIKE '%' || $1 || '%')";
 const count=await pool.query('SELECT COUNT(*)::integer AS total FROM organizations o '+where+filterSQL,[search,countryFilter,statusFilter]);
 const total=count.rows[0]?.total??0;
 const pages=Math.max(1,Math.ceil(total/size));
 const safePage=Math.min(p,pages);
 const {rows}=await pool.query(`SELECT o.id,o.firebase_uid,o.display_name,o.country,
 COALESCE(c.administrative_status,'regular') administrative_status,
 a.applied_state,cmd.state delivery_state,o.last_synced_at,s.status subscription_status,s.ends_at,p.title plan_title,
 COALESCE(c.bonus_days,0) bonus_days,COALESCE(c.internal_note,'') internal_note
 FROM organizations o LEFT JOIN organization_controls c ON c.organization_id=o.id
 LEFT JOIN organization_access a ON a.organization_id=o.id
 LEFT JOIN administrative_commands cmd ON cmd.id=a.last_command_id
 LEFT JOIN LATERAL(SELECT * FROM subscriptions x WHERE x.organization_id=o.id ORDER BY x.created_at DESC LIMIT 1) s ON true
 LEFT JOIN plans p ON p.id=s.plan_id
 ${where}${filterSQL} ORDER BY ${order} LIMIT $4 OFFSET $5`,[search,countryFilter,statusFilter,size,(safePage-1)*size]);
 return {rows,total,page:safePage,pages,pageSize:size};
}
