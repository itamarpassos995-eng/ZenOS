import {summarizeManifest} from './domain.js';
import embeddedFonts from './pdfFonts.js';
import {buildLocalPdf,localPdfImage} from '../zenReceiptPdf.js';
import {distributionText,distributionMoney} from './i18n.js';
export async function manifestPdf(document,{language='pt',copy=false,imageLoader=localPdfImage}={}) {
 const t=distributionText(language),pages=[];let commands=[],y=790;
 const esc=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const put=(s,x=42,size=10,bold=false)=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 0.08 0.14 0.20 rg 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET`);
 const line=()=>commands.push(`0.73 0.80 0.82 RG 0.5 w 42 ${y} m 553 ${y} l S`);
 const wrap=(s,width=78)=>String(s??'').match(new RegExp(`.{1,${width}}`,'gu'))||[''];
 const add=(s,size=10,bold=false,step=17)=>{for(const part of wrap(s,Math.floor(1000/size*.78))){reserve(step);put(part,42,size,bold);y-=step;}};
 const footer=()=>{const saved=y;y=39;put(`${t('nonFiscal')} | ${document.number} / v${document.version}`,42,8);put(String(pages.length+1),540,8);y=saved;};
 const header=()=>{y=790;put(t('manifestTitle').toLocaleUpperCase(),42,19,true);y-=25;put(`${document.number}  /  ${t('version')} ${document.version}${copy?'  /  '+t('copy'):''}`,42,10,true);y-=27;line();y-=21;};
 const next=()=>{footer();pages.push(commands);commands=[];header();};
 function reserve(h){if(y-h<65)next();}
 header();
 const logo=document.issuer.logoData?await imageLoader(document.issuer.logoData):null;
 // Logo is optional and snapshot-referenced; PDF content never depends on current catalog.
 if(logo){const h=26,w=Math.min(100,h*logo.w/logo.h);commands.push(`q ${w} 0 0 ${h} 445 782 cm /Logo Do Q`);}
 add(document.issuer.name,13,true);add(document.issuer.taxId,9);
 add(`${t('date')}: ${new Date(document.issuedAt).toLocaleString(language==='es'?'es-PY':'pt-BR',{timeZone:document.timeZone||'UTC'})}`,9);add(`${t('warehouse')}: ${document.warehouseId}`,9);
 add(`${t('vehicle')}: ${document.vehicle}   |   ${t('driver')}: ${document.driver}`,9);
 add(`${t('route')}: ${document.route}`,9);y-=5;line();y-=20;
 const {products,customers}=summarizeManifest(document);
 add(t('loadSummary'),13,true);
 for(const row of products){
  add(`${row.sku} | ${row.description} | ${t('authorizedQuantity')}: ${row.quantity} ${row.unit}`,10,true);
  if(row.checked!==undefined)add(`${t('checked')}: ${row.checked} ${row.unit} | ${t('shortage')}: ${row.quantity-row.checked}`,9);
  const details=[row.variant,row.packaging,row.lot,row.warehouseId].filter(Boolean);
  if(details.length)add(details.join(' | '),9);
 }
 add(t('byCustomer'),13,true);
 for(const group of customers){
  reserve(140);
  add(`${group.city||t('cityUnknown')} | ${group.name}`,11,true);
  for(const row of group.lines){
  reserve(120);
  add(`${t('order')} ${row.orderId}  |  ${t('seller')}: ${row.sellerId}`,9,true);
  add(`${row.customerName} - ${row.destination}`,10);
  add(`${row.sku}  |  ${row.description}`,10,true);
  add(`${t('quantity')}: ${row.quantity} ${row.unit}     ${t('amount')}: ${distributionMoney(row.amount)}`,10);
  y-=6;line();y-=18;
  }
 }
 reserve(150);add(`${t('items')}: ${document.lines.length}`,10,true);add(t('total'),10,true);
 for(const [currency,minor] of Object.entries(document.totalsByCurrency))add(distributionMoney({currency,minor,precision:currency==='PYG'?0:2}),10);
 add(`${t('verification')}: ${document.verificationCode}`,8);y-=27;
 add(`__________________________        __________________________`,9);
 add(`${t('signCheck')}                     ${t('signDriver')}`,9);
 footer();pages.push(commands);
 const bytes=buildLocalPdf(pages,logo,embeddedFonts);return {bytes,blob:new Blob([bytes],{type:'application/pdf'}),name:`${document.number.replace(/[^a-z0-9_-]/gi,'-')}-v${document.version}${copy?'-copy':''}.pdf`,pages:pages.length};
}
