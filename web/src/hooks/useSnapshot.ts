import { useEffect, useRef, useState } from 'react';
import { AuthError, fetchState } from '../api';
import type { Snapshot } from '../types';

export type ConnState = 'connecting' | 'live' | 'off';

/**
 * Conecta ao painel: valida o token, abre o SSE (/manager/stream) e mantém o
 * último snapshot em estado. Em 401 chama onUnauthorized (para deslogar).
 */
export function useSnapshot(token: string, onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<ConnState>('connecting');

  // Mantém o callback estável para o effect só depender do token.
  const onUnauthRef = useRef(onUnauthorized);
  onUnauthRef.current = onUnauthorized;

  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let cancelled = false;
    setState('connecting');

    fetchState(token)
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        // O EventSource não envia headers -> token vai na querystring.
        es = new EventSource(`/manager/stream?token=${encodeURIComponent(token)}`);
        es.onopen = () => !cancelled && setState('live');
        es.onmessage = (ev) => {
          if (cancelled) return;
          try {
            setSnapshot(JSON.parse(ev.data) as Snapshot);
            setState('live');
          } catch {
            /* ignora frame malformado */
          }
        };
        es.onerror = () => !cancelled && setState('off'); // EventSource reconecta sozinho
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AuthError) onUnauthRef.current();
        else setState('off');
      });

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [token]);

  return { snapshot, state };
}
