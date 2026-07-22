// ---------------------------------------------------------------------------
// Normalização de telefone brasileiro. Puro (sem I/O) — fácil de testar.
// ---------------------------------------------------------------------------

/**
 * Normaliza um telefone BR para o formato +DDIDDNUMERO (ex: +5531999984339).
 *  - Remove tudo que não é dígito.
 *  - Tira o "0" de tronco (ex: 031999984339 -> 31999984339).
 *  - Garante o DDI 55 quando o número veio só com DDD.
 * Retorna '' quando não há dígitos.
 */
export function normalizePhoneBR(raw: string | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, ''); // remove zero de tronco
  const hasDDI = d.startsWith('55') && (d.length === 12 || d.length === 13);
  if (!hasDDI && (d.length === 10 || d.length === 11)) d = '55' + d; // só tinha DDD
  return '+' + d;
}

/**
 * True quando o número (já com +55) é um celular: 13 dígitos e o 9º dígito
 * logo após o DDD (padrão do celular brasileiro).
 */
export function isMobileBR(normalized: string | null | undefined): boolean {
  const d = String(normalized ?? '').replace(/\D/g, '');
  return d.length === 13 && d.startsWith('55') && d[4] === '9';
}

// DDDs geográficos válidos do Brasil. Serve para descartar números NÃO
// geográficos (0800, 0300, 0500, 0900...) que, ao normalizar, viram "55 80 ..."
// e dariam um "DDD" 80 inexistente.
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Extrai o DDD (2 dígitos após o DDI 55) de um número normalizado (+55DD...).
 * Só devolve quando é um DDD geográfico VÁLIDO — 0800/0300 e afins retornam ''.
 */
export function dddFromPhone(normalized: string | null | undefined): string {
  const d = String(normalized ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4);
    if (VALID_DDD.has(Number(ddd))) return ddd;
  }
  return '';
}
