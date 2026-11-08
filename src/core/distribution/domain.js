/** Distribution v1: deterministic domain, no Firebase/client or accounting side effects. */
export const SCHEMA_VERSION = 1;
export const fail = code => { throw Object.assign(new Error(code), {code}); };
const requireValue = (value, code) => { if (!value) fail(code); };
export const clone = value => structuredClone(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const STATES = freeze({
 order: {DRAFT:['SUBMITTED','CANCELLED'],SUBMITTED:['APPROVED','ON_HOLD','REJECTED','CANCELLED'],ON_HOLD:['SUBMITTED','CANCELLED'],APPROVED:['IN_FULFILLMENT','CANCELLED'],IN_FULFILLMENT:['PARTIALLY_FULFILLED','FULFILLED'],PARTIALLY_FULFILLED:['FULFILLED'],FULFILLED:['CLOSED'],REJECTED:[],CANCELLED:[],CLOSED:[]},
 picking: {PENDING:['ASSIGNED','CANCELLED'],ASSIGNED:['IN_PROGRESS','BLOCKED','CANCELLED'],IN_PROGRESS:['CHECKED','SHORTAGE','BLOCKED'],SHORTAGE:['IN_PROGRESS','CANCELLED'],BLOCKED:['ASSIGNED','CANCELLED'],CHECKED:['COMPLETED'],COMPLETED:[],CANCELLED:[]},
 load: {DRAFT:['PLANNED','CANCELLED'],PLANNED:['LOADING','BLOCKED','CANCELLED'],LOADING:['LOADED','BLOCKED','CANCELLED'],LOADED:['APPROVED','BLOCKED'],APPROVED:['DISPATCHED','BLOCKED'],BLOCKED:['PLANNED','CANCELLED'],DISPATCHED:['RETURNED','INCIDENT'],INCIDENT:['RETURNED'],RETURNED:['RECONCILED'],RECONCILED:['CLOSED'],CLOSED:[],CANCELLED:[]},
 delivery: {PLANNED:['OUT_FOR_DELIVERY'],OUT_FOR_DELIVERY:['ARRIVED','FAILED','REFUSED'],ARRIVED:['DELIVERED','PARTIALLY_DELIVERED','FAILED','REFUSED'],PARTIALLY_DELIVERED:['RETURN_PENDING'],FAILED:['RESCHEDULED','RETURN_PENDING'],REFUSED:['RETURN_PENDING'],RESCHEDULED:[],RETURN_PENDING:[],DELIVERED:[]},
 settlement: {OPEN:['SUBMITTED'],SUBMITTED:['UNDER_REVIEW'],UNDER_REVIEW:['APPROVED','DISPUTED','REJECTED'],DISPUTED:['SUBMITTED'],REJECTED:['SUBMITTED'],APPROVED:['POSTED'],POSTED:['CLOSED'],CLOSED:['REOPENED_BY_AUTHORIZED_ACTION'],REOPENED_BY_AUTHORIZED_ACTION:['UNDER_REVIEW']},
});
export function transition(domain, current, next) {
 requireValue(STATES[domain]?.[current]?.includes(next), 'INVALID_TRANSITION');
 return next;
}
export const PRECISION = freeze({BRL:2,PYG:0,USD:2,EUR:2});
export function money({minor,currency,precision,kind,source}) {
 requireValue(Object.hasOwn(PRECISION,currency) && precision === PRECISION[currency], 'INVALID_CURRENCY_PRECISION');
 requireValue(typeof minor === 'string' && /^(0|[1-9]\d*)$/.test(minor), 'INVALID_MINOR_AMOUNT');
 requireValue(typeof kind === 'string' && kind.length > 0 && typeof source === 'string' && source.length > 0, 'MONEY_CONTEXT_REQUIRED');
 return freeze({minor,currency,precision,kind,source});
}
export function totalsByCurrency(amounts) {
 const totals = {};
 for (const amount of amounts) { const m = money(amount); totals[m.currency] = ((BigInt(totals[m.currency] || '0')) + BigInt(m.minor)).toString(); }
 return totals;
}
export function validateQuantities({authorized,dispatched,delivered,refused,returned,pending}) {
 const values = [authorized,dispatched,delivered,refused,returned,pending];
 requireValue(values.every(n => Number.isSafeInteger(n) && n >= 0), 'INVALID_QUANTITY');
 requireValue(dispatched <= authorized && BigInt(delivered)+BigInt(refused)+BigInt(returned)+BigInt(pending) === BigInt(dispatched), 'QUANTITY_NOT_RECONCILED');
}
const text = value => typeof value === 'string' && value.trim().length > 0;
export function createLoad({id,tenantId,warehouseId,policyVersion}) {
 requireValue([id,tenantId,warehouseId,policyVersion].every(text), 'LOAD_IDENTITY_REQUIRED');
 return freeze({schemaVersion:1,id,tenantId,warehouseId,policyVersion,state:'DRAFT',revision:0,lines:[],manifestVersions:[]});
}
export function replaceLoadLines(load, lines) {
 requireValue(['DRAFT','PLANNED','LOADING'].includes(load.state), 'LOAD_LOCKED');
 requireValue(Array.isArray(lines) && lines.length > 0 && lines.length <= 200, 'INVALID_LOAD_LINES');
 const ids = new Set();
 const clean = lines.map(line => {
  requireValue(line.tenantId === load.tenantId, 'TENANT_MISMATCH');
  requireValue(['id','orderId','orderLineId','productId','sku','description','unit','customerId','customerName','destination','sellerId'].every(k => text(line[k])), 'LINE_SNAPSHOT_REQUIRED');
  requireValue(!ids.has(line.id), 'DUPLICATE_LINE'); ids.add(line.id);
  requireValue(Number.isSafeInteger(line.quantity) && line.quantity > 0, 'INVALID_QUANTITY');
  // Quantity is in the product's declared base unit. Fractional packaging awaits an explicit conversion contract.
  const amount = money(line.amount);
  return {...Object.fromEntries(['id','orderId','orderLineId','productId','sku','description','unit','customerId','customerName','destination','sellerId'].map(k=>[k,line[k]])),...Object.fromEntries(['city','variant','packaging','lot'].filter(k=>text(line[k])).map(k=>[k,line[k]])),tenantId:load.tenantId,quantity:line.quantity,amount};
 });
 return freeze({...clone(load),lines:clean,revision:load.revision+1});
}
export function transitionLoad(load,next) {
 transition('load',load.state,next);
 requireValue(next === 'CANCELLED' || load.lines.length > 0, 'EMPTY_LOAD');
 // Dispatch requires an issued document for the exact approved revision.
 if (next === 'DISPATCHED') requireValue(load.manifestVersions.some(m=>m.loadRevision === load.revision), 'CURRENT_MANIFEST_REQUIRED');
 return freeze({...clone(load),state:next,revision:load.revision+1});
}
export function issueManifest(load,{documentId,number,issuedAt,issuer,vehicle,driver,route,verificationCode,timeZone='UTC'}) {
 requireValue(load.state === 'APPROVED', 'LOAD_NOT_APPROVED');
 requireValue([documentId,number,issuedAt,vehicle,driver,route,verificationCode].every(text) && Number.isFinite(Date.parse(issuedAt)), 'MANIFEST_HEADER_REQUIRED');
 requireValue(issuer && ['name','taxId'].every(k=>text(issuer[k])), 'ISSUER_REQUIRED');
 requireValue(!load.manifestVersions.some(m=>m.documentId === documentId), 'DUPLICATE_DOCUMENT');
 const document = freeze({schemaVersion:1,documentId,number,version:load.manifestVersions.length+1,tenantId:load.tenantId,loadId:load.id,loadRevision:load.revision+1,issuedAt,timeZone,issuer:clone(issuer),warehouseId:load.warehouseId,vehicle,driver,route,verificationCode,lines:clone(load.lines),totalsByCurrency:totalsByCurrency(load.lines.map(l=>l.amount))});
 return freeze({...clone(load),revision:load.revision+1,manifestVersions:[...clone(load.manifestVersions),document]});
}
export function historicalManifest(load,version) {
 const document = load.manifestVersions.find(m=>m.version === version);
 requireValue(document, 'MANIFEST_NOT_FOUND');
 return freeze(clone(document));
}

// Project one immutable manifest version. Distinct allocations of the same
// order line in other loads are outside this document.
export function summarizeManifest(document) {
 const products = new Map(), customers = new Map(), seen = new Set();
 for (const row of document.lines) {
  if (seen.has(row.id)) fail('DUPLICATE_LINE');
  seen.add(row.id);
  const dimensions = {
   productId:row.productId, sku:row.sku, unit:row.unit,
   variant:row.variant??'', packaging:row.packaging??'', lot:row.lot??'',
   warehouseId:row.warehouseId??document.warehouseId
  };
  const productKey = JSON.stringify(dimensions);
  const item = products.get(productKey) ?? {...dimensions,key:productKey,description:row.description,quantity:0};
  item.quantity += row.quantity;
  products.set(productKey,item);
  const key = JSON.stringify([row.city??'',row.customerId,row.destination]);
  const customer = customers.get(key) ?? {key,city:row.city??'',name:row.customerName,lines:[]};
  customer.lines.push(row);
  customers.set(key,customer);
 }
 return {products:[...products.values()],customers:[...customers.values()]};
}
