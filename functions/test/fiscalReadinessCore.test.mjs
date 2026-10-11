import test from 'node:test';
import assert from 'node:assert/strict';
import {avaliarProntidaoFiscal,mensagemProntidaoFiscal} from '../src/fiscalReadinessCore.js';

const br={razaoSocial:'Loja',cnpj:'123',inscricaoEstadual:'123',uf:'MS',municipioCodigoIbge:'5000000',endereco:'Rua',cep:'79000000'};
const py={razonSocial:'Tienda',ruc:'12345',dv:'1',direccion:'Calle',departamento:'Central',distrito:'Distrito',establecimiento:'001',puntoExpedicion:'001',timbrado:'123'};
const flags={credenciamentoConfirmado:true,credencialValidada:true,provedorHomologado:true};
test('bloqueia país desconhecido',()=>assert.deepEqual(avaliarProntidaoFiscal({pais:'XX'}).pendencias,['FISCAL_PAIS_INVALIDO']));
test('bloqueia documento incompatível com país',()=>assert.deepEqual(avaliarProntidaoFiscal({pais:'BR',tipoDocumento:'factura_electronica'}).pendencias,['FISCAL_TIPO_INVALIDO']));
test('não autoriza emissão apenas pelo cadastro preenchido',()=>assert.equal(avaliarProntidaoFiscal({pais:'BR',tipoDocumento:'nfe',cadastro:br}).apto,false));
test('campos faltantes são expostos sem dados sigilosos',()=>assert.deepEqual(avaliarProntidaoFiscal({pais:'BR',tipoDocumento:'nfe',cadastro:{}}).camposAusentes,['razaoSocial','cnpj','inscricaoEstadual','uf','municipioCodigoIbge','endereco','cep']));
test('indica prontidão lógica quando todas as provas são confirmadas',()=>assert.equal(avaliarProntidaoFiscal({pais:'BR',tipoDocumento:'nfe',cadastro:br,...flags}).apto,true));
test('Paraguai exige dados específicos',()=>assert.equal(avaliarProntidaoFiscal({pais:'PY',tipoDocumento:'factura_electronica',cadastro:py,...flags}).apto,true));
test('não assume aptidão com credenciais não validadas',()=>assert.equal(avaliarProntidaoFiscal({pais:'PY',tipoDocumento:'factura_electronica',cadastro:py,credenciamentoConfirmado:true}).apto,false));
test('mensagens nos três idiomas',()=>{assert.match(mensagemProntidaoFiscal('FISCAL_CADASTRO_INCOMPLETO','pt'),/Cadastro/);assert.match(mensagemProntidaoFiscal('FISCAL_CADASTRO_INCOMPLETO','es'),/Registro/);assert.match(mensagemProntidaoFiscal('FISCAL_CADASTRO_INCOMPLETO','en'),/Incomplete/);});
