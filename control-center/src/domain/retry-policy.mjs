// Pure exponential retry policy; no timer, network, Firebase or provider coupling.
export function nextRetryAt({attempt,nowMs=Date.now(),baseMs=1000,capMs=300000}={}){
 if(!Number.isInteger(attempt)||attempt<0||attempt>100)throw Error('INVALID_ATTEMPT');
 if(!Number.isFinite(nowMs)||!Number.isFinite(baseMs)||!Number.isFinite(capMs)||baseMs<=0||capMs<baseMs)throw Error('INVALID_RETRY_CONFIG');
 const delay=Math.min(capMs,baseMs*2**Math.min(attempt,20));
 return new Date(nowMs+delay).toISOString();
}
export function classifyDeliveryError({statusCode}={}){
 if(statusCode===408||statusCode===429||statusCode>=500)return 'retry';
 if(statusCode>=400&&statusCode<500)return 'dead_letter';
 return 'delivered';
}
