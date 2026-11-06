import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const css=readFileSync('src/form-controls.css','utf8'),ast=postcss.parse(css);
const rule=selector=>ast.nodes.find(n=>n.type==='rule'&&n.selector.replace(/\s/g,'')===selector.replace(/\s/g,''));
const vars=node=>Object.fromEntries(node.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]));
const luminance=hex=>{
 const values=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
 return values.reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
for(const [name,palette] of [['escuro',vars(rule(':root'))],['claro e loja pública',vars(rule('.theme-light, .commerce-store'))]]){
 test(name+': texto, placeholder e desabilitado atendem contraste mínimo de 4,5:1',()=>{
  for(const [fg,bg] of [['--zen-field-fg','--zen-field-bg'],['--zen-field-placeholder','--zen-field-bg'],['--zen-field-disabled-fg','--zen-field-disabled-bg']]){
   const ratio=contrast(palette[fg],palette[bg]);assert.ok(ratio>=4.5,`${name} ${fg}: ${ratio.toFixed(2)}:1`);
  }
  assert.ok(contrast(palette['--zen-field-focus'],palette['--zen-field-bg'])>=3,'Foco deve permanecer visível');
 });
}
test('controles e opções protegem texto e fundo juntos, incluindo preenchimento WebKit',()=>{
 const fieldRule=ast.nodes.find(n=>n.type==='rule'&&n.selector.includes('input:not('));
 for(const property of ['background-color','color','-webkit-text-fill-color'])assert.ok(fieldRule.nodes.some(n=>n.prop===property&&n.important));
 assert.ok(fieldRule.selector.includes('select'));assert.ok(fieldRule.selector.includes('textarea'));
 const options=vars(rule(':where(select option, select optgroup)'));
 assert.equal(options.color,'var(--zen-field-fg)');assert.equal(options['background-color'],'var(--zen-field-bg)');
 const selection=vars(rule(':where(select option:checked)'));
 assert.ok(contrast(selection.color,selection['background-color'])>=4.5);
 assert.equal(vars(rule(':where(input, textarea)::placeholder')).opacity,'1');
 assert.ok(css.includes(':-webkit-autofill'));
 assert.ok(css.includes('@media (forced-colors: active)'));
});
test('padronização é global e os estilos antigos do tema claro não sobrescrevem o placeholder',()=>{
 assert.match(readFileSync('src/index.css','utf8'),/^@import '\.\/form-controls.css';/);
 assert.doesNotMatch(readFileSync('src/zenos-dashboard.css','utf8'),/color:#8196ad!important/);
 assert.ok(css.includes('[type=checkbox]')&&css.includes('[type=color]'),'Controles especiais devem preservar aparência própria');
});
