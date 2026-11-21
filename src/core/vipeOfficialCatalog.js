import official from '../data/vipeOfficialPrices20261031.json' with {type:'json'};
import {vipeLegacyPYG} from './vipeLegacyNative.js';
/**
 * Read-only authoritative migration catalog. Match by imported product ID,
 * migration provenance and original SKU. Never by name/barcode alone.
 * No writes and no conversions at current FX.
 */
export function vipeOfficialProduct(prod,storeId,defaultCurrency){
 if(!vipeLegacyPYG(storeId,defaultCurrency)||!prod)return null;
 const match=/^VIPE-PROD-(\d+)$/.exec(String(prod.id||''));
 if(!match)return null;
 if(prod.origemMigracao!=null && prod.origemMigracao!=='VIPE-FPX')return null;
 if(prod.idOrigemMigracao!=null && String(prod.idOrigemMigracao)!==match[1])return null;
 const entry=official.rows[match[1]];
 if(!entry)return null;
 const [originalSku,custoPYG,precoPYG]=entry;
 if(String(prod.sku||'').trim()!==String(originalSku).trim())return null;
 if(!Number.isSafeInteger(precoPYG)||precoPYG<=0||!Number.isSafeInteger(custoPYG)||custoPYG<0)
  throw Error('Catálogo histórico VIPE contém valor inválido: '+match[1]);
 return Object.freeze({source:official.source,sourceDate:official.createdAt,
   idOrigem:match[1],sku:String(originalSku).trim(),custoPYG,precoPYG});
}
export function precoOficialVipePYG(prod,field,storeId,defaultCurrency){
 if(field!=='precoBRL')return null;
 return vipeOfficialProduct(prod,storeId,defaultCurrency)?.precoPYG??null;
}
