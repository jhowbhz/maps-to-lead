import { useCallback, useState } from 'react';
import { clearToken, downloadLeadsXlsx, getToken, setToken as saveToken } from './api';
import { JobsTable } from './components/JobsTable';
import { Kpis } from './components/Kpis';
import { LeadsTable } from './components/LeadsTable';
import { Login } from './components/Login';
import { Tabs, type TabKey } from './components/Tabs';
import { Topbar } from './components/Topbar';
import { useSnapshot } from './hooks/useSnapshot';

const TAB_KEY = 'mgr_tab';

// Token inicial: querystring ?token= (removida da URL após ler) ou localStorage.
function initialToken(): string {
  const q = new URLSearchParams(window.location.search).get('token');
  if (q) {
    saveToken(q);
    window.history.replaceState?.(null, '', window.location.pathname);
    return q;
  }
  return getToken();
}

// Lembra a última aba usada.
function initialTab(): TabKey {
  return localStorage.getItem(TAB_KEY) === 'leads' ? 'leads' : 'jobs';
}

export default function App() {
  const [token, setTok] = useState<string>(initialToken);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [downloading, setDownloading] = useState(false);

  const onUnauthorized = useCallback(() => {
    clearToken();
    setTok('');
    setAuthError('Token inválido.');
  }, []);

  const { snapshot, state } = useSnapshot(token, onUnauthorized);

  if (!token) {
    return (
      <Login
        error={authError}
        onSubmit={(t) => {
          saveToken(t);
          setAuthError('');
          setTok(t);
        }}
      />
    );
  }

  const logout = () => {
    clearToken();
    setTok('');
    setAuthError('');
  };

  const changeTab = (t: TabKey) => {
    setTab(t);
    localStorage.setItem(TAB_KEY, t);
  };

  const download = () => {
    setDownloading(true);
    downloadLeadsXlsx(token)
      .catch(() => alert('Falha ao gerar o XLSX.'))
      .finally(() => setDownloading(false));
  };

  return (
    <>
      <Topbar state={state} uptimeMs={snapshot?.uptimeMs ?? 0} onLogout={logout} />
      <main>
        <div className="section-title">Visão geral</div>
        {snapshot ? <Kpis snap={snapshot} /> : <div className="empty">Conectando ao painel…</div>}

        {/* Abas + botão XLSX na mesma linha (sempre visível, sem pular ao trocar de aba). */}
        <div className="tabbar">
          <Tabs
            active={tab}
            jobsCount={snapshot?.jobs.length ?? 0}
            leadsCount={snapshot?.totals.leads ?? 0}
            onChange={changeTab}
          />
          <button type="button" className="btn secondary" onClick={download} disabled={downloading}>
            {downloading ? 'Gerando…' : '⬇ Baixar XLSX'}
          </button>
        </div>

        {tab === 'jobs' ? (
          <JobsTable jobs={snapshot?.jobs ?? []} />
        ) : (
          <LeadsTable token={token} refreshSignal={snapshot?.totals.leads ?? 0} />
        )}

        <div className="foot">
          {snapshot ? `atualizado ${new Date(snapshot.now).toLocaleTimeString('pt-BR')} · ` : ''}
          jobs e leads persistidos em SQLite
        </div>
      </main>
    </>
  );
}
