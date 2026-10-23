import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V2_TAIL_WINDOW_SIZE,shouldRearmV2Tail} from '../src/core/v2TailWindow.js';

assert.equal(V2_TAIL_WINDOW_SIZE,100);
for(let size=0;size<V2_TAIL_WINDOW_SIZE;size++){
  assert.equal(shouldRearmV2Tail(size,8,8+size),false,`Reinscrição prematura com ${size} operações`);
}
assert.equal(shouldRearmV2Tail(100,8,108),true);
assert.equal(shouldRearmV2Tail(100,8,107),false);
assert.equal(shouldRearmV2Tail(100,8,109),true);
assert.equal(shouldRearmV2Tail(100,8,NaN),false);
const repo=readFileSync(new URL('../src/core/operationalRepository.js',import.meta.url),'utf8');
assert.match(repo,/limit\(V2_TAIL_WINDOW_SIZE\)\),snap=>\{/);
assert.match(repo,/shouldRearmV2Tail\(snap.size,captured,this.sequence\)/);
assert.doesNotMatch(repo,/if\(this.sequence>captured&&!rearming\)/);
console.log('V2 tail: assinatura estável até 100 operações; rearm seguro aprovado.');
