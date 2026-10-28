import React,{useEffect,useRef} from 'react';
export default function CommerceDialog({title,onClose,busy=false,children}){
 const ref=useRef(null);
 useEffect(()=>{
  const dialog=ref.current,previous=document.activeElement;
  document.documentElement.classList.add('commerce-dialog-open');
  dialog.showModal();
  return()=>{dialog.close();document.documentElement.classList.remove('commerce-dialog-open');previous?.focus?.();};
 },[]);
 return <dialog ref={ref} className="commerce-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header className="commerce-dialog-head"><h2>{title}</h2><button type="button" className="commerce-icon-button" aria-label="Fechar janela" disabled={busy} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  <div className="commerce-dialog-body">{children}</div>
 </dialog>;
}
