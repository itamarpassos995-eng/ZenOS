/** Isolated print document: only the historical snapshot participates in A4 pagination. */
export async function printManifest(element,css,{document:hostDocument=window.document}={}) {
 if(!element)throw new Error('MANIFEST_NOT_FOUND');
 const frame=hostDocument.createElement('iframe');
 frame.title='ZenOS A4';frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;';hostDocument.body.appendChild(frame);
 const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><title>ZenOS</title></head><body class="dist"></body></html>');doc.close();
 const style=doc.createElement('style');style.textContent=css+'\n@media print{.dist-manifest{position:static!important;width:100%!important;min-width:0!important;}}';doc.head.appendChild(style);
 doc.body.appendChild(element.cloneNode(true));
 await Promise.all([...doc.images].map(image=>image.decode?.().catch(()=>{})||Promise.resolve()));
 frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
 frame.contentWindow.focus();frame.contentWindow.print();
 // Browsers without afterprint still release the frame later.
 setTimeout(()=>frame.remove(),60000);
}
