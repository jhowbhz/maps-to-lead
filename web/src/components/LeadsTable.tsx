import { useState } from 'react';
import { ms, n, tierClass, whenStr } from '../format';
import { useLeads } from '../hooks/useLeads';
import type { LeadRecord } from '../types';
import { Pager } from './Pager';

const PAGE = 12;

function LeadRow({ l }: { l: LeadRecord }) {
  return (
    <tr>
      <td>
        <span className={`score-chip ${tierClass(l.tier)}`}>
          {l.tier} · {n(l.score)}
        </span>
      </td>
      <td className="lead-name" title={l.name}>
        {l.name || '—'}
      </td>
      <td className="mono">{l.phone ? l.phone : <span className="no">sem telefone</span>}</td>
      <td>{l.whatsapp ? <span className="wa">● WhatsApp</span> : <span className="no">—</span>}</td>
      <td>
        {l.website ? (
          <a href={l.website} target="_blank" rel="noopener noreferrer">
            abrir
          </a>
        ) : (
          <span className="no">—</span>
        )}
      </td>
      <td className="mono">
        {l.rating ? (
          <>
            {l.rating}
            {l.reviews ? <span className="no"> ({l.reviews})</span> : null}
          </>
        ) : (
          <span className="no">—</span>
        )}
      </td>
      <td className="mono">{ms(l.ms)}</td>
      <td className="mono no">{whenStr(l.at)}</td>
    </tr>
  );
}

export function LeadsTable({ token, refreshSignal }: { token: string; refreshSignal: number }) {
  const [page, setPage] = useState(0);
  const { leads, total } = useLeads(token, page, PAGE, refreshSignal);

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Score</th><th>Nome</th><th>Telefone</th><th>WhatsApp</th><th>Site</th><th>Nota</th><th>Latência</th><th>Quando</th>
            </tr>
          </thead>
          <tbody>
            {leads.length ? (
              leads.map((l, i) => <LeadRow key={`${l.jobId}-${l.at}-${i}`} l={l} />)
            ) : (
              <tr>
                <td colSpan={8} className="empty">
                  Nenhum lead ainda. Dispare um POST em /api/find.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager total={total} page={page} pageSize={PAGE} unit="leads" onPage={setPage} />
    </div>
  );
}
