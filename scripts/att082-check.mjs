import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { calcularResumoSessao } from '../src/core/cashSession.js';
import { ehOperadorGerencial, patenteEfetivaOperador, validarCredencialGerencial } from '../src/core/accessControl.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log(`[OK] ${name}`); };

await check('Administrador principal é reconhecido como gerência por identidade', () => {
  assert.equal(ehOperadorGerencial({ id:'admin', senha:'admin' }), true);
  assert.equal(patenteEfetivaOperador({ id:'admin' }), 'gerencia');
});
await check('Usuário com permissão admin é tratado como patente gerencial', () => {
  assert.equal(ehOperadorGerencial({ id:'42', permissoes:{admin:true} }), true);
  assert.equal(patenteEfetivaOperador({ id:'42', permissoes:{admin:true} }), 'gerencia');
});
await check('PIN do administrador cadastrado autoriza operação gerencial', async () => {
  const r = await validarCredencialGerencial({ vendedores:[{id:'admin',nome:'Adm',senha:'admin'}], senha:'admin', senhaLegada:'1234' });
  assert.equal(r?.id, 'admin');
});
await check('Senha legada não contorna PIN quando existe gerente cadastrado', async () => {
  const r = await validarCredencialGerencial({ vendedores:[{id:'admin',senha:'novo-pin'}], senha:'1234', senhaLegada:'1234' });
  assert.equal(r, null);
});
await check('Compatibilidade legada só existe quando não há gerente cadastrado', async () => {
  const r = await validarCredencialGerencial({ vendedores:[], senha:'1234', senhaLegada:'1234' });
  assert.equal(r?.legado, true);
});
await check('PDV valida PIN contra operadores gerenciais em vez de senha fixa', () => {
  const src=read('src/components/PDV.jsx');
  assert.match(src,/validarCredencialGerencial/);
  assert.doesNotMatch(src,/String\(senhaMargemInput\)\s*!==\s*String\(regras\?\.senhaGerente/);
});
await check('Produto protegido usa a mesma credencial gerencial', () => {
  const src=read('src/components/Produtos.jsx');
  assert.match(src,/validarCredencialGerencial/);
});
await check('Terminal PIN não é campo password do navegador', () => {
  const src=read('src/components/TerminalLogin.jsx');
  assert.doesNotMatch(src,/type="password"/);
  assert.match(src,/autoComplete="one-time-code"/);
  assert.match(src,/WebkitTextSecurity/);
});
await check('PIN de autorização de margem não é tratado pelo Chrome como senha de site', () => {
  const src=read('src/components/PDV.jsx');
  assert.match(src,/name="zenos-manager-approval-pin"/);
  assert.match(src,/WebkitTextSecurity:'disc'/);
});
await check('Configurações permite trocar PIN de operadores sem expor PIN atual', () => {
  const src=read('src/components/Configuracoes.jsx');
  assert.match(src,/ALTERAR PIN DE ACESSO/);
  assert.match(src,/Salvar novo PIN/);
  assert.match(src,/PIN: <strong[^>]*>••••<\/strong>/);
});
await check('Administrador principal não pode ser removido ou rebaixado', () => {
  const src=read('src/components/Configuracoes.jsx');
  assert.match(src,/Administrador principal protegido/);
  assert.match(src,/String\(idVendedor\) === 'admin'/);
});
await check('App usa modal ZenOS no logout e não possui diálogos nativos', () => {
  const src=read('src/App.jsx');
  assert.match(src,/<ZenModal/);
  assert.doesNotMatch(src,/window\.(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(src,/(?:^|[^\w.])(?:alert|confirm|prompt)\s*\(/m);
});
await check('Configurações não usa alert/confirm nativo nos fluxos alterados', () => {
  const src=read('src/components/Configuracoes.jsx');
  assert.doesNotMatch(src,/window\.(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(src,/(?:^|[^\w.])(?:alert|confirm|prompt)\s*\(/m);
});
await check('Venda cancelada após pagamento continua contando a entrada física original', () => {
  const sessao={id:'s1',operadorId:'v1',operadorNome:'Vendedor',saldoInicial:0,status:'aberta',createdAt:'2026-10-06T20:00:00.000Z'};
  const historicoVendas=[{id:'venda1',vendedorId:'v1',estado:'cancelada',createdAt:'2026-10-06T20:10:00.000Z',pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:60}],trocoBRL:0}];
  const r=calcularResumoSessao({sessao,historicoVendas,caixaMovimentos:[]});
  assert.equal(r.vendasDinheiro,60);
  assert.equal(r.saldoEsperado,60);
});
await check('Venda cash 60 + devolução cash 60 fecha em zero, nunca -60', () => {
  const sessao={id:'s1',operadorId:'v1',operadorNome:'Vendedor',saldoInicial:0,status:'aberta',createdAt:'2026-10-06T20:00:00.000Z'};
  const historicoVendas=[{id:'venda1',vendedorId:'v1',estado:'cancelada',createdAt:'2026-10-06T20:10:00.000Z',pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:60}],trocoBRL:0}];
  const caixaMovimentos=[{id:'r1',sessaoId:'s1',tipo:'saida_devolucao',direcao:'saida',afetaGaveta:true,valorBRL:60,createdAt:'2026-10-06T20:20:00.000Z'}];
  const r=calcularResumoSessao({sessao,historicoVendas,caixaMovimentos});
  assert.equal(r.vendasDinheiro,60);
  assert.equal(r.devolucoesDinheiro,60);
  assert.equal(r.saldoEsperado,0);
});
await check('Devolução revalida o saldo do caixa imediatamente antes de gravar', () => {
  const src=read('src/components/Vendas.jsx');
  assert.match(src,/Saldo do caixa mudou/);
  assert.match(src,/resumoAtualizado/);
});
await check('Sangria acima do saldo é bloqueada em vez de criar caixa negativo', () => {
  const src=read('src/App.jsx');
  assert.match(src,/A sangria não pode ser maior que o dinheiro físico disponível/);
});
await check('Configuração de aprovação de margem aponta para PIN gerencial cadastrado', () => {
  const src=read('src/components/Configuracoes.jsx');
  assert.match(src,/PIN de qualquer Administrador\/Gerência cadastrado/);
});
await check('Nenhum alert/confirm/prompt nativo permanece no src do ZenOS', () => {
  const files=[];
  const walk=dir=>{ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if(/\.(js|jsx)$/.test(e.name)) files.push(p); } };
  walk(path.join(root,'src'));
  for(const file of files){ const src=fs.readFileSync(file,'utf8'); assert.doesNotMatch(src,/window\.(?:alert|confirm|prompt)\s*\(/,file); assert.doesNotMatch(src,/(?:^|[^\w.])(?:alert|confirm|prompt)\s*\(/m,file); }
});

console.log(`\nATT 08.2: ${ok}/${ok} verificações de PIN, browser, modais e caixa aprovadas.`);
