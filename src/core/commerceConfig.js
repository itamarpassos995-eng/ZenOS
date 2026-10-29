export const sanitizarSlugLoja = (texto = '') => {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
};

import { zenosStorage } from './storage';

export const commerceConfigPadrao = {
  habilitado: true,
  nomeLoja: '',
  slogan: '',
  descricao: '',
  whatsapp: '',
  mensagemPadrao: 'Olá! Gostaria de confirmar meu pedido feito pelo catálogo online do ZenOS.',
  logoUrl: '',
  bannerUrl: '',
  corTema: '#0284c7',
  aceitaRetirada: true,
  enderecoRetirada: '',
  aceitaEntrega: true,
  taxaEntrega: 'A combinar',
  prazoEstimado: '40 a 60 min',
  horarioFuncionamento: 'Segunda a Sexta: 08:00 às 18:00 | Sábado: 08:00 às 12:00',
  avisoTopo: '',
  mostrarPreco: true,
  chavePix: '',
  slug: '',
  produtosLoja: {},
  descontoGeralPorcentagem: 0,
};

export const normalizarCommerceConfig = (dados = {}, perfilLoja = null, lojaId = '') => {
  const c = dados || {};
  return {
    ...commerceConfigPadrao,
    nomeLoja: (c.nomeLoja || perfilLoja?.nomeFantasia || perfilLoja?.razaoSocial || '').trim(),
    whatsapp: (c.whatsapp || perfilLoja?.telefone || '').trim(),
    enderecoRetirada: (c.enderecoRetirada || perfilLoja?.endereco || '').trim(),
    logoUrl: c.logoUrl || perfilLoja?.logoLoja || '',
    bannerUrl: c.bannerUrl || '',
    corTema: c.corTema || '#0284c7',
    slug: sanitizarSlugLoja(c.slug || c.nomeLoja || lojaId || ''),
    produtosLoja: (c.produtosLoja && typeof c.produtosLoja === 'object') ? c.produtosLoja : {},
    descontoGeralPorcentagem: Number(c.descontoGeralPorcentagem || 0),
    ...c,
  };
};

export const chaveCommerceConfigLocal = (lojaId) => {
  const uid = String(lojaId || '').trim();
  return uid ? `zenos_${uid}_commerce_config` : null;
};

export const lerCommerceConfigLocal = (lojaId, perfilLoja = null) => {
  const chave = chaveCommerceConfigLocal(lojaId);
  if (!chave) return normalizarCommerceConfig({}, perfilLoja, lojaId);
  try {
    const salvo = zenosStorage.getItem(chave);
    return normalizarCommerceConfig(salvo ? JSON.parse(salvo) : {}, perfilLoja, lojaId);
  } catch {
    return normalizarCommerceConfig({}, perfilLoja, lojaId);
  }
};

export const salvarCommerceConfigLocal = (lojaId, config) => {
  const chave = chaveCommerceConfigLocal(lojaId);
  const normalizado = normalizarCommerceConfig(config, null, lojaId);
  if (!chave) return normalizado;
  zenosStorage.setItem(chave, JSON.stringify(normalizado));
  return normalizado;
};

export const comprimirImagem = (arquivo, maxWidth = 800, maxHeight = 400, qualidade = 0.75) => {
  return new Promise((resolve, reject) => {
    if (!arquivo) return resolve('');
    const reader = new FileReader();
    reader.onloadend = () => {
      const original = reader.result;
      const img = new Image();
      img.onload = () => {
        try {
          const escala = Math.min(1, maxWidth / Math.max(img.width || 1, 1), maxHeight / Math.max(img.height || 1, 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * escala));
          canvas.height = Math.max(1, Math.round(img.height * escala));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', qualidade));
        } catch {
          resolve(original);
        }
      };
      img.onerror = () => resolve(original);
      img.src = original;
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(arquivo);
  });
};
