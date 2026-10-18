// Read-routing contract used by the application repository; production activation
// remains gated by an administrative certificate and deployment approval.
// An absent flag is always legacy. A failed V2 read must never silently select
// a stale V1 snapshot after cutover.
export function resolveV2ReadMode(control) {
  if (control == null || control.mode === 'legacy') return {primary:'v1',shadow:false};
  if (!['shadow','v2','maintenance'].includes(control.mode)) throw new Error('Modo de armazenamento desconhecido.');
  if (!/^[a-f0-9]{24}$/.test(control.generation||'')) throw new Error('Geração V2 inválida.');
  if (control.mode==='maintenance') return {primary:'v2',shadow:false,readOnly:true,generation:control.generation};
  if (control.mode==='shadow') return {primary:'v1',shadow:true,generation:control.generation};
  const cert=control.certificate;
  if (!cert || cert.sourceChecksum!==control.sourceChecksum || cert.productionReady!==true
      || cert.v1WritersFenced!==true || cert.finalReconciliationPassed!==true
      || cert.pdvIntegrationPassed!==true || cert.rollbackPrepared!==true) {
    throw new Error('Ativação V2 sem certificado completo; escritas devem permanecer bloqueadas.');
  }
  return {primary:'v2',shadow:false,generation:control.generation};
}
