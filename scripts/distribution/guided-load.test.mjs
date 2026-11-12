import test from 'node:test';
import assert from 'node:assert/strict';
import {guidedLoadStage,guidedLoadStatus,guidedFullCheck,guidedTruckReady} from '../../src/core/distribution/guidedLoad.js';
const load=(state,extra={})=>({state,revision:6,lines:[{id:'a',quantity:5},{id:'b',quantity:3}],manifestVersions:[],...extra});
test('four operator stages map backend states without bypassing mandatory transitions',()=>{
 assert.equal(guidedLoadStage(load('DRAFT')),0);
 assert.equal(guidedLoadStage(load('PLANNED')),0);
 assert.equal(guidedLoadStage(load('LOADING')),1);
 assert.equal(guidedLoadStage(load('LOADED')),1);
 assert.equal(guidedLoadStage(load('APPROVED')),2);
 assert.equal(guidedLoadStage(load('APPROVED',{truckLoading:{},manifestVersions:[{loadRevision:6}]})),3);
 assert.equal(guidedLoadStage(load('DISPATCHED')),4);
 assert.equal(guidedLoadStatus(load('DRAFT')).canPrepare,true);
 assert.equal(guidedLoadStatus(load('LOADED')).canApprove,true);
 assert.equal(guidedLoadStatus(load('APPROVED',{loadingCheck:{}})).canConfirmTruck,true);
 assert.equal(guidedLoadStatus(load('APPROVED',{truckLoading:{}})).requiresManifest,true);
 assert.equal(guidedLoadStatus(load('APPROVED',{truckLoading:{},manifestVersions:[{loadRevision:6}]})).canDispatch,true);
 assert.equal(guidedLoadStatus(load('APPROVED',{truckLoading:{},manifestVersions:[{loadRevision:5}]})).canDispatch,false);
});
test('physical checking requires explicit valid quantities and reason for shortage',()=>{
 const lines=load('LOADING').lines;
 assert.equal(guidedFullCheck(lines,{},'').valid,false);
 assert.deepEqual(guidedFullCheck(lines,{0:'5',1:'3'},''),{valid:true,full:true,quantities:[5,3],reason:''});
 assert.equal(guidedFullCheck(lines,{0:'5',1:'2'},'').valid,false);
 assert.deepEqual(guidedFullCheck(lines,{0:'5',1:'2'},'Avaria'),{valid:true,full:false,quantities:[5,2],reason:'Avaria'});
 assert.equal(guidedFullCheck(lines,{0:'6',1:'3'},'Erro').valid,false);
 assert.equal(guidedFullCheck(lines,{0:'4.5',1:'3'},'Erro').valid,false);
});
test('truck quantities must match the approved load exactly and remain explicit',()=>{
 const lines=load('APPROVED').lines;
 assert.equal(guidedTruckReady(lines,{}),false);
 assert.equal(guidedTruckReady(lines,{a:'5',b:'3'}),true);
 assert.equal(guidedTruckReady(lines,{a:'5',b:'2'}),false);
 assert.equal(guidedTruckReady(lines,{a:'5',b:''}),false);
 assert.equal(guidedTruckReady(lines,{a:'5.5',b:'3'}),false);
});
