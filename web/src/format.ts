import type { JobStatus, Snapshot, Tier } from './types';

export const n = (x: number | null | undefined): string => (x ?? 0).toLocaleString('pt-BR');

export function ms(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v < 1000) return `${v} ms`;
  if (v < 60000) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)} s`;
  const m = Math.floor(v / 60000);
  const s = Math.round((v % 60000) / 1000);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

export const pct = (x: number | null | undefined): string => `${x ?? 0}%`;

export function whenStr(at: number | null | undefined): string {
  if (!at) return '—';
  try {
    return new Date(at).toLocaleTimeString('pt-BR');
  } catch {
    return '—';
  }
}

export const tierClass = (t: string | null | undefined): string => `sc-${String(t || 'd').toLowerCase()}`;

export function tierFor(score: number): Tier {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export function statusLabel(st: JobStatus): string {
  switch (st) {
    case 'scraping': return 'Fase 1 · buscando';
    case 'parsing': return 'Fase 2 · extraindo';
    case 'done': return 'concluído';
    case 'error': return 'erro';
    default: return st;
  }
}

export function latClass(v: number | null | undefined): string {
  if (v == null) return '';
  if (v >= 8000) return 'bad';
  if (v >= 4000) return 'warn';
  return 'good';
}

/** Latência média global ponderada pelos jobs com latência medida. */
export function avgLat(s: Snapshot): string {
  let tot = 0;
  let cnt = 0;
  for (const j of s.jobs) {
    if (j.latency?.count) {
      tot += j.latency.totalMs;
      cnt += j.latency.count;
    }
  }
  return cnt ? ms(Math.round(tot / cnt)) : '—';
}
