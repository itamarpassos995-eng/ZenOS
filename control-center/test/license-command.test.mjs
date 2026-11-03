import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCommand,nextDeliveryState,resolveAccess} from '../src/domain/license-command.mjs';
const valid={organizationUid:'loja-123',type:'access.suspend',idempotencyKey:'cmd-2026-00000001',actor:'owner-sub',reason:'Solicitação administrativa autorizada'};
test('comando identifica empresa e exige motivo e idempotencia',()=>{
 assert.equal(validateCommand(valid).organizationUid,'loja-123');
 assert.throws(()=>validateCommand({...valid,organizationUid:'lojas/123'}),/INVALID_ORGANIZATION_UID/);
 assert.throws(()=>validateCommand({...valid,reason:'x'}),/REASON_REQUIRED/);
 assert.throws(()=>validateCommand({...valid,idempotencyKey:'short'}),/INVALID_IDEMPOTENCY_KEY/);
});
test('bonus tem duracao limitada e inteira',()=>{
 assert.equal(validateCommand({...valid,type:'subscription.bonus',days:7}).days,7);
 for(const days of [0,366,2.5,-1])assert.throws(()=>validateCommand({...valid,type:'subscription.bonus',days}),/INVALID_BONUS_DAYS/);
});
test('comando pendente nao e aplicado sem ACK',()=>{
 assert.equal(nextDeliveryState('pending','start'),'processing');
 assert.equal(nextDeliveryState('processing','ack'),'applied');
 assert.throws(()=>nextDeliveryState('pending','ack'),/INVALID_DELIVERY_TRANSITION/);
 assert.throws(()=>nextDeliveryState('applied','retry'),/INVALID_DELIVERY_TRANSITION/);
 assert.equal(nextDeliveryState('processing','fail'),'failed');
 assert.equal(nextDeliveryState('failed','retry'),'pending');
});
test('suspensao tem prioridade sobre assinatura ativa',()=>{
 assert.equal(resolveAccess({commercialStatus:'active',administrativeSuspended:true,entitlementValid:true}),'suspended');
 assert.equal(resolveAccess({commercialStatus:'active',administrativeSuspended:false,entitlementValid:true}),'allowed');
 assert.equal(resolveAccess({commercialStatus:'past_due',administrativeSuspended:false,entitlementValid:true}),'restricted');
 assert.equal(resolveAccess({commercialStatus:'grace',administrativeSuspended:false,entitlementValid:true,graceAllowed:true}),'allowed');
 assert.equal(resolveAccess({commercialStatus:'active',administrativeSuspended:false,entitlementValid:false}),'restricted');
});
