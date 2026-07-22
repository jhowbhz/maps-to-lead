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

/**
 * Extrai o DDD (2 dígitos após o DDI 55) de um número normalizado (+55DD...).
 * Retorna '' quando não há DDI/DDD reconhecível.
 */
export function dddFromPhone(normalized: string | null | undefined): string {
  const d = String(normalized ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d.slice(2, 4);
  return '';
}
