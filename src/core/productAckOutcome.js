// Conservador: só autoriza compensação do índice quando a falha é
// seguramente ANTERIOR ao commit. Qualquer ACK incerto preserva a identidade.
const deterministic = new Set([
 'permission-denied','invalid-argument','unauthenticated',
 'zenos_sync_circuit_open','zenos_quota_cooldown','zenos_v1_doc_size',
 'zenos_invalid_business_operation'
]);
export function resultadoCadastroIndeterminado(erro){
 const raw=String(erro?.code||'').toLowerCase().replace(/^firestore\//,'');
 const code=raw.replace(/^zenos_/,'zenos_');
 const message=String(erro?.message||'').toLowerCase();
 if(/a nuvem não confirmou|cloud did not confirm|failed to get documents? from server|network|unavailable|deadline|offline/.test(message))return true;
 if(deterministic.has(code))return false;
 return true; // Desconhecido nunca justifica apagar a reserva anterior.
}
