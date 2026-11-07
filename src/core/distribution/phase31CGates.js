/** Phase 3.1 release fence. Evaluates evidence but cannot execute financial actions.
 * A "PASS" without a verifiable code SHA and evidence is downgraded.
 */
export const B3_GATES=Object.freeze({
 G1:'Native verified write links',
 G2:'Credit partials and installment reconciliation',
 G3:'Historical currency proof',
 G4:'Prior reversal lineage',
 G5:'No duplicate compensation',
 G6:'Tenant and permission isolation',
 G7:'STALE source invalidation',
 G8:'Cash, stock, customer integrity',
 G9:'Full regressions and responsive browser',
 G10:'Documented fiscal and finance constraints'
});
const STATES=Object.freeze(['PASS','PARTIAL','BLOCKED','NOT_TESTED']);
export function evaluatePreparationOfC(raw={}){
 const result={};
 for(const key of Object.keys(B3_GATES)){
  const x=raw[key]||{},status=STATES.includes(x.status)?x.status:'NOT_TESTED';
  const evidences=Array.isArray(x.evidence)?x.evidence.filter(e=>typeof e==='string'&&e.trim()):[];
  const testedSha=typeof x.sha==='string'&&/^[a-f0-9]{40}$/.test(x.sha)?x.sha:null;
  result[key]={
   status:status==='PASS'&&(!testedSha||!evidences.length)?'PARTIAL':status,
   evidence:evidences,sha:testedSha,reason:String(x.reason||'').slice(0,500)
  };
 }
 const allowed=Object.values(result).every(x=>x.status==='PASS');
 return Object.freeze({schema:'DistributionPhaseCPreparationGateV1',
  PREPARATION_OF_C_ALLOWED:allowed,gates:result,
  EXECUTION_OF_C_ALLOWED:false,
  explanation:allowed?'Technical preparation only; financial execution requires separate authorization.':
   'Preparation remains blocked until every G1-G10 gate has verified PASS evidence.'});
}
