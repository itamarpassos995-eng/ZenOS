import {createHash, pbkdf2Sync, timingSafeEqual, randomBytes} from 'node:crypto';
export const error = code => {throw Object.assign(new Error(code),{code});};
export const hash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const id = value => {
 if(typeof value!=='string'||!value.length||value.length>120||value==='.'||value==='..'||value.includes('/')) error('INVALID_ID');
 return encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
};
export function requireEmulators() {
 if(process.env.GCLOUD_PROJECT!=='demo-zenos-local'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099') error('EMULATOR_ONLY');
}
export const credentialFingerprint = op => hash([op.pinHash,op.pinSalt,op.pinVersion,op.pinTrocaObrigatoria,op.senha??null]);
export function verifyPin(op,pin) {
 if(op?.pinTrocaObrigatoria||op?.pinVersion!==2||!/^([a-f0-9]{32})$/i.test(op?.pinSalt||'')||!/^[a-f0-9]{64}$/i.test(op?.pinHash||'')||typeof pin!=='string'||pin.length<4||pin.length>128) return false;
 const candidate=pbkdf2Sync(pin,Buffer.from(op.pinSalt,'hex'),120000,32,'sha256');
 return timingSafeEqual(candidate,Buffer.from(op.pinHash,'hex'));
}
export const canOperate = op => !!op && (op.id==='admin'||op.patente==='gerencia'||op.permissoes?.admin===true||op.permissoes?.produtos===true);
export const token = () => randomBytes(32).toString('hex');

export const distributionPermission=(op,scope='stock')=>{
 if(!op)return false;
 if(op.id==='admin'||op.permissoes?.admin===true)return true;
 if(scope==='tripView')return ['distributionManage','distributionReturns','distributionFinance','distributionFiscalReview'].some(k=>op.permissoes?.[k]===true);
 if(scope==='any')return canOperate(op)||distributionPermission(op,'trip');
 if(scope==='trip')return ['distributionDriver','distributionManage','distributionReturns','distributionFinance','distributionFiscalReview'].some(k=>op.permissoes?.[k]===true);
 if(scope==='admin')return false;
 if(scope==='pdv')return op.permissoes?.pdv===true;
 if(scope==='driver')return op.permissoes?.distributionDriver===true;
 if(scope==='manage')return op.permissoes?.distributionManage===true;
 if(scope==='returns')return op.permissoes?.distributionReturns===true;
 if(scope==='finance')return op.permissoes?.distributionFinance===true && op.permissoes?.pdv===true;
 if(scope==='fiscalReview')return op.permissoes?.distributionFiscalReview===true||op.permissoes?.distributionManage===true;
 return canOperate(op);
};
