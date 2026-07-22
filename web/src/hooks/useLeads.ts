import { useEffect, useState } from 'react';
import { fetchLeads } from '../api';
import type { LeadRecord } from '../types';

/**
 * Busca uma página de leads do SQLite. `refreshSignal` (ex.: total de leads
 * processados) força re-fetch quando novos leads chegam.
 */
export function useLeads(token: string, page: number, pageSize: number, refreshSignal: number) {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeads(token, pageSize, page * pageSize)
      .then((res) => {
        if (cancelled) return;
        setLeads(res.leads);
        setTotal(res.total);
      })
      .catch(() => {
        /* mantém a página atual em caso de erro transitório */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, page, pageSize, refreshSignal]);

  return { leads, total, loading };
}
