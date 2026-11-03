import test from 'node:test';
import assert from 'node:assert/strict';
import {listOrganizationControls} from '../src/server/organization-operations.mjs';

test('consulta somente 25 empresas por pagina e busca no PostgreSQL',async()=>{
 const calls=[];
 const pool={async query(sql,args){calls.push({sql,args});return calls.length===1?{rows:[{total:1001}]}:{rows:[{display_name:'Loja A'}]}}};
 const result=await listOrganizationControls(pool,{q:'Loja',page:2,pageSize:25});
 assert.equal(result.total,1001);
 assert.equal(result.pages,41);
 assert.equal(result.page,2);
 assert.equal(result.rows.length,1);
 assert.deepEqual(calls[0].args,['Loja','','']);
 assert.deepEqual(calls[1].args,['Loja','','',25,25]);
 assert.match(calls[1].sql,/LIMIT \$4 OFFSET \$5/);
 assert.match(calls[1].sql,/ILIKE/);
});

test('ultima pagina invalida e limitada ao total, sem buscar toda a base',async()=>{
 let calls=0,params;
 const pool={async query(sql,args){calls++;if(calls===1)return {rows:[{total:8}]};params=args;return {rows:[]}}};
 const result=await listOrganizationControls(pool,{page:99999,pageSize:25});
 assert.equal(result.page,1);
 assert.equal(result.pages,1);
 assert.deepEqual(params,['','','',25,0]);
});

test('busca nao concatena entrada de usuario ao SQL',async()=>{
 const injection="' OR TRUE --";
 const calls=[];
 const pool={async query(sql,args){calls.push({sql,args});return calls.length===1?{rows:[{total:0}]}:{rows:[]}}};
 await listOrganizationControls(pool,{q:injection});
 assert.equal(calls[0].args[0],injection);
 assert.ok(!calls[0].sql.includes(injection));
 assert.ok(!calls[1].sql.includes(injection));
});
