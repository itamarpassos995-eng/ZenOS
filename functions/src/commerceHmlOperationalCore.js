import {pbkdf2Sync,randomBytes,createHash} from 'node:crypto';
import {bootstrapCommercePermitido} from './commerceHmlBootstrapCore.js';

export const authorizedOperationalHml=(env,auth)=>
 bootstrapCommercePermitido(env,auth) && env.GCLOUD_PROJECT==='zenos-commerce-homologacao';

export const validarPinsHml=(admin,segundo)=>{
 const valid=v=>typeof v==='string'&&/^\d{8,12}$/.test(v)&&
  !/^(\d)\1+$/.test(v)&&!('0123456789'.includes(v))&&!('9876543210'.includes(v));
 if(!valid(admin)||!valid(segundo)||admin===segundo)
  throw new Error('Escolha dois PINs distintos de 8 a 12 dígitos, não sequenciais ou repetidos.');
};
export const hashCredencialHml=pin=>{
 const pinSalt=randomBytes(16).toString('hex');
 return {pinVersion:2,pinSalt,pinHash:pbkdf2Sync(pin,Buffer.from(pinSalt,'hex'),120000,32,'sha256').toString('hex')};
};
export const operatorHmlPath=(uid,id)=>`lojas/${uid}/commerce_private/operador-${createHash('sha256').update(id).digest('hex')}`;

export function documentosOperacionaisFicticios(uid,pinAdmin,pinSegundo){
 validarPinsHml(pinAdmin,pinSegundo);
 const dados=[
  {id:'HML-PDV-001',sku:'HML-PDV-001',nome:'Produto fictício A',tipoItem:'produto',precoBRL:29.9,preco1BRL:29.9,custoBRL:12,estoque:20,estoqueVitrine:5,estoqueGalpao:15,grupo:'Demonstração'},
  {id:'HML-PDV-002',sku:'HML-PDV-002',nome:'Produto fictício B',tipoItem:'produto',precoBRL:15.5,preco1BRL:15.5,custoBRL:6,estoque:14,estoqueVitrine:4,estoqueGalpao:10,grupo:'Demonstração'}
 ];
 const operadores=[
  {id:'admin',nome:'Operador teste A',cargo:'Gerência',patente:'gerencia',permissoes:{admin:true},pinTrocaObrigatoria:false,...hashCredencialHml(pinAdmin)},
  {id:'caixa-2',nome:'Operador teste B',cargo:'Gerência',patente:'gerencia',permissoes:{admin:true},pinTrocaObrigatoria:false,...hashCredencialHml(pinSegundo)},
 ];
 return {
  shop:{status:'ativo',tipo:'homologacao_operacional',plano:'basico',homologacaoProprietarioUid:uid,
   criadoEm:new Date().toISOString(),testeSomente:true},
  operacao:{produtos:dados,clientes:[],historicoVendas:[],caixaMovimentos:[],despesas:[],
   historicoCompras:[],fornecedores:[],vouchers:[],sessoesCaixa:[],vendedores:operadores},
  acessos:operadores.map(o=>({id:o.id,docPath:operatorHmlPath(uid,o.id),
   data:{ativo:true,papel:'admin',versao:1,pinVersion:o.pinVersion,pinSalt:o.pinSalt,pinHash:o.pinHash}})),
  licenca:{status:'ativo',ativacaoConfirmadaServidor:true,planoId:'homologacao_sem_cobranca',homologacao:true}
 };
}
