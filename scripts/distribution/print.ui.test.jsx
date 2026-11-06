import {it,expect,vi} from 'vitest';
import {printManifest} from '../../src/core/distribution/print.js';
it('prints an isolated clone of the historical snapshot without the operational UI',async()=>{
 vi.useFakeTimers();
 const button=document.createElement('button');button.textContent='Operational action';document.body.appendChild(button);
 const snapshot=document.createElement('article');snapshot.className='dist-manifest';snapshot.textContent='ROM-TEST / v1 / COPY';document.body.appendChild(snapshot);
 const pending=printManifest(snapshot,'@page{size:A4;}');
 const frame=document.querySelector('iframe');const print=vi.fn();frame.contentWindow.print=print;frame.contentWindow.focus=vi.fn();
 await pending;
 expect(print).toHaveBeenCalledTimes(1);expect(frame.contentDocument.body.textContent).toBe('ROM-TEST / v1 / COPY');expect(frame.contentDocument.querySelector('button')).toBeNull();
 expect(frame.contentDocument.querySelector('style').textContent).toContain('size:A4');
 snapshot.textContent='changed after print';expect(frame.contentDocument.body.textContent).toBe('ROM-TEST / v1 / COPY');
 frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('afterprint'));expect(document.querySelector('iframe')).toBeNull();
 button.remove();snapshot.remove();vi.runAllTimers();vi.useRealTimers();
});
