import {test} from 'node:test';import assert from 'node:assert/strict';
import {validarCredenciaisFiscais,metadataCredenciais} from '../src/fiscalCredenciaisCore.js';
test('CSC exige consentimento, documento e pares de ambiente válidos',()=>{
 const value={aceite:true,homologacao:{idToken:'000001',csc:'TESTE-SINTETICO-NAO-REAL-123456'}};
 assert.throws(()=>validarCredenciaisFiscais({...value,aceite:false},['nfce']));
 assert.throws(()=>validarCredenciaisFiscais(value,['nfe']));
 assert.throws(()=>validarCredenciaisFiscais({...value,homologacao:{idToken:'0',csc:'abc'}},['nfce']));
 const result=validarCredenciaisFiscais({...value,habilitado:true,tokenFocus:'discard'},['nfce']);
 assert.equal(result.habilitado,undefined);assert.equal(result.tokenFocus,undefined);
 assert.equal(result.homologacao.idToken,'000001');
 const meta=metadataCredenciais(result,'now');assert.equal(meta.emissaoHabilitada,false);assert.equal(meta.certificadoValidado,false);
 assert.ok(!JSON.stringify(meta).includes(value.homologacao.csc));
});
test('certificado limita formato e tamanho sem afirmar validação criptográfica',()=>{
 const bytes=Buffer.alloc(32);bytes[0]=0x30;
 const value={aceite:true,certificado:{base64:bytes.toString('base64'),senha:'synthetic'}};
 const result=validarCredenciaisFiscais(value,['nfe']);assert.equal(metadataCredenciais(result,'now').certificadoRecebido,true);
 assert.throws(()=>validarCredenciaisFiscais({...value,certificado:{base64:'invalid!',senha:'x'}},['nfe']));
 assert.throws(()=>validarCredenciaisFiscais({...value,certificado:{base64:Buffer.alloc(50000).toString('base64'),senha:'x'}},['nfe']));
});
