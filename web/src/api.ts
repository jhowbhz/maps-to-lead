import type { LeadsPage, Snapshot } from './types';

const TOKEN_KEY = 'mgr_token';

export class AuthError extends Error {}

export const getToken = (): string => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

const authHeaders = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

/** Valida o token e devolve o snapshot atual. Lança AuthError em 401. */
export async function fetchState(token: string): Promise<Snapshot> {
  const r = await fetch('/manager/api/state', { headers: authHeaders(token) });
  if (r.status === 401) throw new AuthError('Token inválido.');
  if (r.status === 503) throw new AuthError('MANAGER_TOKEN não configurado no servidor (.env).');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Snapshot;
}

export async function fetchLeads(token: string, limit: number, offset: number): Promise<LeadsPage> {
  const r = await fetch(`/manager/api/leads?limit=${limit}&offset=${offset}`, {
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as LeadsPage;
}

/** Baixa todos os leads como .xlsx (mantém o token no header, não na URL). */
export async function downloadLeadsXlsx(token: string): Promise<void> {
  const r = await fetch('/manager/api/leads.xlsx', { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
