import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarInteresseFiscal,resumirDemandaFiscal} from '../src/fiscalInteresseCore.js';
test('solicitação simples não requer dados fiscais nem habilita emissão',()=>{
 const r=registrarInteresseFiscal(null,{pais:'BR',uid:'owner',agora:'2026-10-13T10:00:00.000Z'});
 assert.equal(r.status,'solicitado');assert.equal(r.habilitado,false);assert.equal(r.cadastro,undefined);
 assert.equal(r.interesse.por,'owner');
 assert.throws(()=>registrarInteresseFiscal(null,{pais:'XX'}));
});
test('clique repetido preserva cadastro, país, aprovação e data originais',()=>{
 const r={pais:'PY',habilitado:true,cadastro:{ruc:'123'},createdAt:'old'};
 assert.equal(registrarInteresseFiscal(r,{pais:'BR'}),r);
});
test('demanda de 30 dias separa empresas e documentos sem inventar emissões',()=>{
 const r=resumirDemandaFiscal([{createdAt:'2026-10-10T00:00:00.000Z',pais:'BR',cadastroCompleto:true,tiposDocumento:['nfce','nfe']},{createdAt:'2026-10-11T00:00:00.000Z',pais:'PY'},{createdAt:'2026-08-01T00:00:00.000Z',pais:'BR'},{createdAt:'2027-01-01T00:00:00.000Z',pais:'BR'}],new Date('2026-10-13T00:00:00.000Z'));
 assert.equal(r.solicitacoes,2);assert.equal(r.brasil,1);assert.equal(r.paraguai,1);assert.equal(r.cadastrosCompletos,1);assert.equal(r.solicitantesPorDocumento.nfce,1);assert.equal(r.emissoesVerificadas,null);
});
