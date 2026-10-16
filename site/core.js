export const LATIN_WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalizeWord = value => value.trim().toLocaleLowerCase('es').replace(/^[¿¡\s.,;:!?"'“”]+|[\s.,;:!?"'“”]+$/g, '').normalize('NFC');
export const spanishParts = text => (text.match(/[¿¡A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\d\s.,;:!?¿¡'’"«»()\-–—/]*/g) || []).filter(x => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(x)).map(s=>s.trim()).filter(Boolean);
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function reviewUpdate(item, known, now = Date.now()) {
  const level = known ? Math.min((Number(item.level) || 0) + 1, 4) : 0;
  const days = known ? [0, 1, 3, 7, 14][level] : 0;
  return { ...item, level, due: now + (known ? days * 86400000 : 600000) };
}
export function validPage(input, total = 305) {
  const page = Number(input);
  return Number.isInteger(page) && page >= 1 && page <= total ? page : null;
}
