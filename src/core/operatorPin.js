import { ZENOS_RUNTIME } from './runtimeEnvironment.js';

const FRACOS = new Set(['admin','1234','0000','1111','senha','password']);
const PBKDF2_ITERATIONS = 120000;

export const pinEhFraco = (pin) => {
  const v = String(pin || '').trim().toLowerCase();
  if (v.length < 4 || FRACOS.has(v)) return true;
  if (/^(.)\1+$/.test(v)) return true;
  if ('0123456789'.includes(v) || '9876543210'.includes(v)) return true;
  return false;
};

const hex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
const saltAleatorio = () => {
  const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); return hex(b);
};
const hexParaBytes = (valor='') => {
  const texto=String(valor||'');
  const bytes=new Uint8Array(Math.floor(texto.length/2));
  for(let i=0;i<bytes.length;i++) bytes[i]=Number.parseInt(texto.slice(i*2,i*2+2),16);
  return bytes;
};

// Compatibilidade somente com um eventual hash v1 gerado durante homologações anteriores da ATT 09.
async function hashPinV1(pin, salt) {
  const dados = new TextEncoder().encode(`${String(salt || '')}|${String(pin || '')}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', dados);
  return hex(new Uint8Array(digest));
}

const hashPinViaHomologacaoBridge = async (pin, salt, version) => {
  if (!ZENOS_RUNTIME.isHomologacao) {
    throw new Error('Web Crypto indisponível neste navegador. A validação segura do PIN exige HTTPS.');
  }
  const response = await fetch('/__zenos_hml_pin/hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ pin: String(pin || ''), salt: String(salt || ''), version: Number(version || 2) }),
  });
  if (!response.ok) throw new Error('Ponte segura de PIN da homologação indisponível.');
  const data = await response.json();
  if (!data?.hash) throw new Error('Resposta inválida da ponte de PIN da homologação.');
  return String(data.hash);
};

export async function hashPin(pin, salt, version = 2) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return hashPinViaHomologacaoBridge(pin, salt, version);
  if (Number(version) === 1) return hashPinV1(pin, salt);
  const key = await subtle.importKey(
    'raw', new TextEncoder().encode(String(pin || '')), { name:'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await subtle.deriveBits({
    name:'PBKDF2', hash:'SHA-256', salt:hexParaBytes(salt), iterations:PBKDF2_ITERATIONS,
  }, key, 256);
  return hex(new Uint8Array(bits));
}

export async function criarCredencialPin(pin) {
  const valor = String(pin || '').trim();
  if (pinEhFraco(valor)) throw new Error('Escolha um PIN menos previsível, com pelo menos 4 caracteres e diferente dos padrões bloqueados.');
  const pinSalt = saltAleatorio();
  const pinVersion = 2;
  const pinHash = await hashPin(valor, pinSalt, pinVersion);
  return { pinHash, pinSalt, pinVersion, pinTrocaObrigatoria: false, senha: null };
}

export async function verificarPinOperador(operador, pin) {
  if (!operador) return false;
  if (operador.pinHash && operador.pinSalt) {
    const version = Number(operador.pinVersion || 1);
    return (await hashPin(pin, operador.pinSalt, version)) === operador.pinHash;
  }
  return String(operador.senha ?? '') === String(pin ?? '');
}

export function operadorRequerTrocaPin(operador) {
  if (!operador) return false;
  if (operador.pinTrocaObrigatoria === true) return true;
  if (operador.pinHash) return false;
  // Credencial legada em texto puro deve ser substituída no próximo acesso.
  return Boolean(operador.senha) || pinEhFraco(operador.senha);
}
