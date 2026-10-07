import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
let ok=0, fail=0;
const check=(cond,msg)=>{ if(cond){console.log(`[OK] ${msg}`);ok++;}else{console.error(`[FALHA] ${msg}`);fail++;} };

const app=read('src/App.jsx');
const ui=read('src/components/ZenVisualLayout.jsx');
const css=read('src/zenos-dashboard.css');
const allSrc=fs.readdirSync(path.join(root,'src'),{recursive:true}).filter(x=>/\.(js|jsx)$/.test(x)).map(x=>read(path.join('src',x))).join('\n');

const protectedHashes={
 'src/components/PDV.jsx':'f4dad4eea5f8477ac049380066b1995354f0798defafd8905143b76c51490f8a',
 'src/components/Produtos.jsx':'ed5dcbfb56158740ae4f064a2dab114745595290514bc99d7294b2864de2737e',
 'src/components/Clientes.jsx':'58bb5ad11700e314e8fc3d2a668ad6892c54ec3f41abf630d7bfe6be9b1b783c',
 'src/components/Vendas.jsx':'72aab289fe5ed9ab1a0ddb0e943e1d19586a10ec69f4a9593b65d2db0f2cb11f',
 'src/components/PDVCompras.jsx':'16577ad57cce756dde04d70e21fee65a01a5eed57fff6a368938c1a45d3e957f',
 'src/components/Despesas.jsx':'8365056a629fe89cab738fdf1e5ad3877f8da028a9b462decc4c12f23d60f97f',
 'src/components/Comissoes.jsx':'bbfece6a1a28640ff859d6e2c9c99ba42a93e38c563f8b2d8236ed1b1cc23a79',
 'src/components/GestaoCaixas.jsx':'7a36b7d8e843618e25234663cf4bea13618de2a62787b78ed24c0f70c3ef71bf',
 'src/components/Configuracoes.jsx':'cc982379c4ca60a4a809fc5ae2e64c657c86c31f92b9026ed6adafbfcd2a7686',
 'src/components/ZenModal.jsx':'70f06f29a241a7e574e271b159a93992943b24ac33637d24fbbab7c14026ec97',
 'src/core/cashSession.js':'b342d8d8986ccc4152bd8370c6b523969ea29c1925135df4b627e64263430c03',
 'src/core/inventory.js':'3da274efcb3790268b6b9682463dd4c76a008fd99fc5be9005438d7d6dd7a7c4',
 'src/core/profitability.js':'3e8ea9fdb6212ed993de97b19711e563cf77177b26080fa1e18f965e380acaa1',
 'src/core/productIdentity.js':'c4353153186ffd6e243a7af525ca339424d9bb2fc3b1b99554d9659ba066002c',
 'src/core/persistenceSafety.js':'9d630eb0ade59e5c831105f970ee974a0b723f546cc8259c3eaaac839c3b8350',
 'src/core/backupRecovery.js':'a0db2e1ea12a72ad412067de5f0ade70e7db664fa5ab067bc8dfe10adf2c6411',
 'src/core/financialLedger.js':'810c62bcb48055db6e1932a38d870bfb740f88ca521fafe97a64d81120d89bee',
};
for(const [file,expected] of Object.entries(protectedHashes)) check(hash(file)===expected,`Core protegido byte a byte: ${file}`);

check(app.includes("import { ZenSidebar, ZenTopbar, ZenHero, ZenKpiCard, ZenQuickCard }"),'App usa somente camada visual nova sobre runtime existente');
check(!app.includes("id === 'pdv' && !sessaoAtiva"),'PDV não é bloqueado por turno fechado na navegação');
check(app.includes("onClick:()=>navegarPara('pdv')"),'Menu Vendas preserva acesso real ao PDV');
check(app.includes("titulo=\"PDV Balcão\"") && app.includes("onClick={()=>navegarPara('pdv')}"),'Card PDV reutiliza a tela real');
check(app.includes("tela:'compras'") && app.includes("onClick:()=>navegarPara('compras')"),'Compras continua presente e funcional');
check(app.includes("tela:'vendas'") && app.includes("onClick:()=>navegarPara('vendas')"),'Histórico / Vendas e Devoluções continua presente');
check(app.includes("tela:'fornecedores'") && app.includes("tela:'inteligencia'") ,'Fornecedores e Inteligência continuam presentes');
check(app.includes("tela:'comissoes'") && app.includes("tela:'dashboardMobile'") && app.includes("tela:'despesas'"),'Comissões, App CEO e Despesas continuam presentes');
check(app.includes("tela:'configuracoes'") && app.includes("tela:'auditoria_caixas'") && app.includes("tela:'migracao'"),'Configurações, Auditoria e Importação continuam presentes');
check(app.includes("ecraAtual === 'pdv' && <PDV") && app.includes("ecraAtual === 'compras' && <PDVCompras") && app.includes("ecraAtual === 'vendas' && <Vendas"),'Renderizações funcionais originais permanecem montadas');
check(app.includes('sessaoAtiva={sessaoAtiva}') && app.includes('saldoSessaoFisicoBRL={saldoSessaoFisicoBRL}'),'PDV/Compras continuam recebendo contexto real de caixa');
check(app.includes("zenos_${userId}_ui_theme") && app.includes('zenosStorage.setItem'),'Tema é persistido por UID usando storage isolado');
check(css.includes('.theme-light') && css.includes('.zen-sidebar') && css.includes('.zen-quick-card'),'Tema claro/escuro, sidebar e cards estão implementados por CSS');
check(ui.includes('is-compact') && ui.includes('zen-nav-flyout'),'Sidebar compacta preserva acesso por flyout');
check(ui.includes('grupo.itens.map') && ui.includes('item.onClick?.()'),'Gavetas renderizam os handlers fornecidos pela baseline');
check(!fs.existsSync(path.join(root,'src/components/ZenOSUI.jsx')) && !fs.existsSync(path.join(root,'src/zenos-ui.css')),'Código da ATT 10 rejeitada não foi reutilizado');
check(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(allSrc),'Nenhum diálogo nativo existe em src');
for(const name of ['fazerLogout','trocarOperador','abrirTurnoDeCaixa','registrarMovimentoCaixa','processarFechamentoCego','salvarPerfilRapido','registrarFinanceiro','temPermissao']) check(app.includes(name),`Handler aprovado preservado: ${name}`);

console.log(`\nATT 10.1: ${ok}/${ok+fail} verificações de paridade funcional e UI aprovadas.`);
if(fail) process.exit(1);
