import { zenosStorage } from './storage';

export const perfilLojaPadrao = {
  nomeFantasia:'', razaoSocial:'', pais:'BR', documento1:'', documento2:'', telefone:'', endereco:'', cidade:'', logoLoja:'',
  rodapeRecibo:'Obrigado pela preferência! Volte sempre.', cabecalhoRecibo:'', larguraRecibo:'80', mostrarLogoRecibo:true, mostrarEnderecoRecibo:true, mostrarTelefoneRecibo:true
};

export const normalizarPerfilLoja = p => ({...perfilLojaPadrao,...(p||{})});

export const chavePerfilLojaUsuario = (userId) => {
  const uid = String(userId || '').trim();
  return uid ? `zenos_${uid}_perfil_loja` : null;
};

export const lerPerfilLojaLocal = (userId) => {
  const chave = chavePerfilLojaUsuario(userId);
  if (!chave) return normalizarPerfilLoja({});
  try { return normalizarPerfilLoja(JSON.parse(zenosStorage.getItem(chave)||'{}')); }
  catch { return normalizarPerfilLoja({}); }
};

export const salvarPerfilLojaLocal = (userId, perfil) => {
  const chave = chavePerfilLojaUsuario(userId);
  const x = normalizarPerfilLoja(perfil);
  if (!chave) return x;
  zenosStorage.setItem(chave, JSON.stringify(x));
  return x;
};

export const limparPerfilLojaLocal = (userId) => {
  const chave = chavePerfilLojaUsuario(userId);
  if (!chave) return false;
  return zenosStorage.removeItem(chave);
};

export const larguraCssRecibo = p => String(p?.larguraRecibo||'80')==='58'?'58mm':String(p?.larguraRecibo||'80')==='A4'?'210mm':'80mm';
