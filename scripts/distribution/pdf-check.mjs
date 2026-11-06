import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {manifestPdf} from '../../src/core/distribution/pdf.js';
const doc=JSON.parse(await readFile('tmp/distribution/manifest-snapshot.json','utf8'));
async function jpegImage(dataUrl){
 const data=Buffer.from(dataUrl.split(',')[1],'base64');let offset=2;
 while(offset<data.length){const marker=data.readUInt16BE(offset);offset+=2;const size=data.readUInt16BE(offset);if([0xffc0,0xffc1,0xffc2].includes(marker))return {w:data.readUInt16BE(offset+5),h:data.readUInt16BE(offset+3),data};offset+=size;}
 throw Error('Invalid JPEG snapshot');
}
await mkdir('tmp/distribution',{recursive:true});
for(const [language,copy] of [['pt',false],['es',true]]) {
 const pdf=await manifestPdf(doc,{language,copy,imageLoader:jpegImage});
 assert.equal(Buffer.from(pdf.bytes.slice(0,8)).toString(),'%PDF-1.4');
 await writeFile(`tmp/distribution/romaneio-${language}.pdf`,pdf.bytes);
}
const stress={...doc,lines:Array.from({length:50},(_,i)=>({...doc.lines[i%doc.lines.length],id:`line-${i}`,description:`Produto sintético ${i+1} / lote de teste / embalagem íntegra`}))};
const multipage=await manifestPdf(stress,{language:'es',copy:true,imageLoader:jpegImage});assert.ok(multipage.pages>1);await writeFile('tmp/distribution/romaneio-multipage.pdf',multipage.bytes);
console.log(JSON.stringify({pdf:true,a4:[595.28,841.89],languages:['pt','es'],historicalSnapshotVersion:doc.version,stressPages:multipage.pages}));
