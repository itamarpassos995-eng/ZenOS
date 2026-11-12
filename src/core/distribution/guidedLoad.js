// UI-only staging workflow projection; transactional safety remains in the distribution service.
export const guidedLoadStage=load=>{
 if(!load)return 0;
 if(load.state==='DISPATCHED')return 4;
 if(load.state==='APPROVED')return load.truckLoading&&load.manifestVersions?.at(-1)?.loadRevision===load.revision?3:2;
 if(load.state==='LOADED'||load.state==='LOADING')return 1;
 return 0;
};
export const guidedLoadStatus=load=>({
 step:guidedLoadStage(load),
 canPrepare:load?.state==='DRAFT'||load?.state==='PLANNED',
 canCheck:load?.state==='LOADING'&&load.pickingState!=='SHORTAGE',
 canApprove:load?.state==='LOADED',
 needsPartialApproval:load?.state==='LOADING'&&load.pickingState==='SHORTAGE',
 canConfirmTruck:load?.state==='APPROVED'&&!!load.loadingCheck&&!load.truckLoading,
 requiresManifest:load?.state==='APPROVED'&&!!load.truckLoading&&load.manifestVersions?.at(-1)?.loadRevision!==load.revision,
 canDispatch:load?.state==='APPROVED'&&!!load.truckLoading&&load.manifestVersions?.at(-1)?.loadRevision===load.revision
});
export const guidedFullCheck=(lines,checked,reason='')=>{
 if(!Array.isArray(lines)||!lines.length)return {valid:false,full:false,quantities:[],reason:''};
 const quantities=lines.map((line,i)=>checked[i]===undefined||checked[i]===''?NaN:Number(checked[i]));
 const valid=quantities.every((quantity,i)=>Number.isSafeInteger(quantity)&&quantity>=0&&quantity<=lines[i].quantity);
 const full=valid&&quantities.every((quantity,i)=>quantity===lines[i].quantity);
 return {valid:valid&&(full||!!reason.trim()),full,quantities,reason:reason.trim()};
};
export const guidedTruckReady=(lines,truck)=>!!lines?.length&&lines.every(line=>{
 const value=truck[line.id];return value!==undefined&&String(value).trim()!==''&&
 Number.isSafeInteger(Number(value))&&Number(value)===line.quantity;
});
