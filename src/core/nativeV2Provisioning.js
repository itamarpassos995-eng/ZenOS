import {getFunctions,httpsCallable} from 'firebase/functions';

export const nativeV2Enabled=()=>import.meta.env.VITE_ZENOS_NATIVE_V2_ENABLED==='true';
export async function provisionNativeV2Store(db){
  const functions=getFunctions(db.app,'southamerica-east1');
  const result=await httpsCallable(functions,'provisionNativeV2Store')({});
  if(!['created','existing-control','existing-legacy'].includes(result.data?.status))
    throw new Error('Resposta de criação de armazenamento inválida.');
  return result.data;
}
