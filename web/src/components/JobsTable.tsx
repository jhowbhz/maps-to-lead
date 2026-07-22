import { useState } from 'react';
import { latClass, ms, n, statusLabel, tierClass, tierFor } from '../format';
import type { JobView } from '../types';
import { Pager } from './Pager';

const PAGE = 12;

function JobRow({ j }: { j: JobView }) {
  const c = j.counters;
  const L = j.latency;
  const sc = j.score;
  const ti = sc.tiers;
  const found = j.totalFound || j.requested || 0;
  const avgTier = tierFor(sc.avg || 0);
  return (
    <tr>
      <td className="lead-name" title={j.query}>
        <div style={{ fontWeight: 600 }}>{j.query || '—'}</div>
        <div className="no" style={{ fontSize: 11 }}>
          {j.error ? (
            <span style={{ color: 'var(--bad)' }}>{j.error}</span>
          ) : (
            `${n(found)} lugares${j.onlyWithPhone ? ' · só tel' : ''}`
          )}
        </div>
      </td>
      <td>
        <span className={`badge ${j.status}`}>{statusLabel(j.status)}</span>
      </td>
      <td style={{ minWidth: 132 }}>
        <div className="meter" style={{ marginBottom: 4 }}>
          <i style={{ width: `${j.progress || 0}%` }} />
        </div>
        <div className="no mono" style={{ fontSize: 11 }}>
          {n(c.processed)}/{n(found)} · {j.progress || 0}%
        </div>
      </td>
      <td className="mono good">{n(c.withPhone)}</td>
      <td className="mono good">{n(c.withWhatsapp)}</td>
      <td className="mono">{n(c.withWebsite)}</td>
      <td className="mono">{n(c.sent)}</td>
      <td className="mono">{c.errors ? <span style={{ color: 'var(--bad)' }}>{n(c.errors)}</span> : '0'}</td>
      <td>
        <span className={`score-chip ${tierClass(avgTier)}`}>
          {avgTier} · {n(sc.avg || 0)}
        </span>
      </td>
      <td className="mono no" style={{ fontSize: 11 }}>
        {n(ti.A)}/{n(ti.B)}/{n(ti.C)}/{n(ti.D)}
      </td>
      <td className="mono">{ms(j.phase1Ms)}</td>
      <td className={`mono ${latClass(L.avgMs)}`}>{ms(L.avgMs)}</td>
      <td className="mono">{ms(j.elapsedMs)}</td>
    </tr>
  );
}

export function JobsTable({ jobs }: { jobs: JobView[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(jobs.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = jobs.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Processo</th><th>Status</th><th>Progresso</th><th>Telefone</th><th>WhatsApp</th><th>Site</th>
              <th>Enviados</th><th>Erros</th><th>Score</th><th>A/B/C/D</th><th>Fase 1</th><th>Latência</th><th>Tempo</th>
            </tr>
          </thead>
          <tbody>
            {slice.length ? (
              slice.map((j) => <JobRow key={j.id} j={j} />)
            ) : (
              <tr>
                <td colSpan={13} className="empty">
                  Nenhum processo ainda. Dispare um POST em /api/find para ver aqui em tempo real.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager total={jobs.length} page={cur} pageSize={PAGE} unit="processos" onPage={setPage} />
    </div>
  );
}
