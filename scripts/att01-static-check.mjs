import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('src/App.jsx');
const data = read('src/data.js');
const safety = read('src/core/persistenceSafety.js');
const allSrc = fs.readdirSync(path.join(root, 'src/components'))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => read(`src/components/${f}`))
  .join('\n') + '\n' + app + '\n' + data + '\n' + safety;

const checks = [];
const check = (name, condition) => {
  checks.push({ name, condition: Boolean(condition) });
  if (!condition) throw new Error(`FALHOU: ${name}`);
};

check('App não contém persistência silenciosa .catch(()=>{})', !app.includes('.catch(()=>{})'));
check('Persistência V1 mantém caminho lojas/{uid}/dados/operacao', safety.includes("['lojas', userId, 'dados', 'operacao']"));
check('Persistência V1 mantém merge:true', /setDoc\([\s\S]*\{ merge: true \}\)/m.test(safety));
check('ATT 01 não usa deleteDoc', !allSrc.includes('deleteDoc'));
check('ATT 01 não usa deleteField', !allSrc.includes('deleteField'));
check('ATT 01 não usa localStorage.clear', !allSrc.includes('localStorage.clear'));
check('ATT 01 não usa localStorage.removeItem', !allSrc.includes('localStorage.removeItem'));
check('App não grava schema version automaticamente', !app.includes("localStorage.setItem('zenos_schema_version'"));
check('Normalizador de produto preserva campos existentes', /normalizarProduto[^\n]+\(\{ \.\.\.p,/.test(data));
check('Normalizador de cliente preserva campos existentes', /normalizarCliente[^\n]+\(\{ \.\.\.c,/.test(data));
check('App usa camada segura para produtos', app.includes("field: 'produtos'"));
check('App usa camada segura para clientes', app.includes("field: 'clientes'"));
check('App usa camada segura para vendas', app.includes("field: 'historicoVendas'"));
check('App usa camada segura para caixa', app.includes("field: 'caixaMovimentos'"));
check('App usa camada segura para despesas', app.includes("field: 'despesas'"));
check('App usa camada segura para compras', app.includes("field: 'historicoCompras'"));
check('App usa camada segura para fornecedores', app.includes("field: 'fornecedores'"));
check('App usa camada segura para regras de desconto', app.includes("field: 'regrasDesconto'"));
check('App usa camada segura para sessões de caixa', app.includes("field: 'sessoesCaixa'"));
check('App usa camada segura para vendedores', app.includes("field: 'vendedores'"));
check('Nenhuma estrutura V2 foi adicionada ao runtime', !allSrc.includes('useV2Database') && !allSrc.includes('/v2'));

for (const item of checks) console.log(`[OK] ${item.name}`);
console.log(`\nATT 01: ${checks.length} verificações estáticas aprovadas.`);
