/** Planejamento PURO de migração da foto já salva no cadastro V1 para Storage do Commerce.
 * Sem gravar no Firestore, sem executar upload nem publicar endpoints.
 * A operação real exige autenticação, autorização e regras de Storage no servidor.
 */
import { createHash } from 'node:crypto';
const ID=/^[a-zA-Z0-9._:-]{1,120}$/;
const TIPOS={jpeg:'jpg',png:'png',webp:'webp'};
const mimeValido=(b,sub)=>{
 if(sub==='png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(sub==='jpeg')return b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
 if(sub==='webp')return b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP';
 return false;
};
export function prepararSincronizacaoFotoLegada({lojaId,produtoId,fotoCadastro}={}){
 if(!ID.test(String(lojaId||''))||!ID.test(String(produtoId||'')))throw new Error('Loja ou produto inválido.');
 if(typeof fotoCadastro!=='string'||fotoCadastro.length>14_000_000)throw new Error('Foto ausente ou fora do limite seguro.');
 const match=/^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(fotoCadastro);
 if(!match)throw new Error('A foto legada não está em formato de imagem suportado.');
 const encoded=match[2],sub=match[1].toLowerCase();
 if(!encoded||encoded.length%4!==0)throw new Error('Base64 inválido.');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length<64||bytes.length>10_000_000||bytes.toString('base64')!==encoded)throw new Error('Dados de imagem inválidos.');
 if(!mimeValido(bytes,sub))throw new Error('Assinatura digital da imagem não corresponde ao formato.');
 const hash=createHash('sha256').update(bytes).digest('hex');
 const path=`commerce/${lojaId}/produtos/${produtoId}/cadastro/${hash}.${TIPOS[sub]}`;
 return {lojaId,produtoId,path,hash,bytes,mime:'image/'+sub,tamanho:bytes.length,
   status:'AGUARDANDO_UPLOAD_AUTORIZADO',idempotente:true};
}
export function caminhoImagemPertenceLoja({path,lojaId,produtoId}={}){
 if(!ID.test(String(lojaId||''))||!ID.test(String(produtoId||'')))return false;
 return typeof path==='string' && path.startsWith(`commerce/${lojaId}/produtos/${produtoId}/`)
  && /^commerce\/[a-zA-Z0-9._:-]{1,120}\/produtos\/[a-zA-Z0-9._:-]{1,120}\/(?:cadastro|galeria)\/[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(path);
}
