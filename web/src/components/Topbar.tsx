import { ms } from '../format';
import type { ConnState } from '../hooks/useSnapshot';

interface TopbarProps {
  state: ConnState;
  uptimeMs: number;
  onLogout: () => void;
}

export function Topbar({ state, uptimeMs, onLogout }: TopbarProps) {
  const cls = state === 'live' ? 'status live' : state === 'off' ? 'status off' : 'status';
  const txt = state === 'live' ? 'ao vivo' : state === 'off' ? 'reconectando…' : 'conectando…';
  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" /> maps-to-lead{' '}
        <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>· painel ao vivo</span>
      </div>
      <div className="spacer" />
      <div className={cls}>
        <span className="dot" /> <span>{txt}</span>
      </div>
      <div className="status">
        <span className="num">uptime {ms(uptimeMs)}</span>
      </div>
      <button className="btn secondary" onClick={onLogout}>
        Sair
      </button>
    </div>
  );
}
