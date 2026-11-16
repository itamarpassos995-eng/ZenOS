import {syncValuesEqual} from './syncMerge.js';
import {v2Error} from './operationalV2Schema.js';

// The authoritative entity document is still written IN FULL in the same
// Firestore transaction. Only the chronological receipt is compacted.
// Receipts are applied in sequence, so the preceding entity is always present.
export function compactProductReceiptPatch(patch, previous) {
 if(patch?.field!=='produtos'||patch.deleted||!previous||previous.deleted
    ||!previous.data||!patch.data||typeof previous.data!=='object'||typeof patch.data!=='object')return patch;
 const changes={};
 for(const [key,value] of Object.entries(patch.data)) {
  if(!syncValuesEqual(value,previous.data[key]))changes[key]=value;
 }
 const removed=Object.keys(previous.data).filter(key=>!Object.prototype.hasOwnProperty.call(patch.data,key));
 const {data,...header}=patch;
 return {...header,deltaData:changes,...(removed.length?{removedDataKeys:removed}:{})};
}

export function expandProductReceiptPatch(patch,previous) {
 if(!Object.prototype.hasOwnProperty.call(patch,'deltaData'))return patch;
 if(patch.field!=='produtos'||!previous||previous.deleted||!previous.data
    ||!patch.deltaData||Array.isArray(patch.deltaData)||typeof patch.deltaData!=='object')
  throw v2Error('V2_RECEIPT_DELTA_BASE','Recibo incremental sem produto anterior; sincronização bloqueada.');
 const data={...previous.data,...patch.deltaData};
 for(const key of patch.removedDataKeys||[])delete data[key];
 const {deltaData,removedDataKeys,...header}=patch;
 return {...header,data};
}
