import {useCallback,useEffect,useState} from 'react';
import {lerIdiomaUi,salvarIdiomaUi} from './uiLanguage.js';

export function useUiLanguage(storage) {
 const [idioma,setIdiomaEstado]=useState(()=>lerIdiomaUi(storage));
 const setIdioma=useCallback(value=>{
  const proximo=salvarIdiomaUi(storage,value);
  if(proximo)setIdiomaEstado(proximo);
 },[storage]);
 useEffect(()=>{
  document.documentElement.lang=idioma==='es'?'es-PY':idioma==='en'?'en':'pt-BR';
 },[idioma]);
 return [idioma,setIdioma];
}
