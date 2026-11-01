export const UI_LANGUAGE_KEY = 'zenos_ui_language';
const idiomas = new Set(['pt', 'es', 'en']);
export const normalizarIdiomaUi = value => {
  const base = String(value || '').toLowerCase().split(/[-_]/)[0];
  return idiomas.has(base) ? base : null;
};
export function lerIdiomaUi(storage) {
  try {
    const salvo = normalizarIdiomaUi(storage?.getItem(UI_LANGUAGE_KEY));
    if (salvo) return salvo;
  } catch (_) {}
  return 'pt';
}
export function salvarIdiomaUi(storage, value) {
  const idioma = normalizarIdiomaUi(value);
  if (!idioma) return null;
  try { storage?.setItem(UI_LANGUAGE_KEY, idioma); } catch (_) {}
  return idioma;
}
