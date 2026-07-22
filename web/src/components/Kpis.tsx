import type { ReactNode } from 'react';
import { avgLat, n, pct } from '../format';
import type { Snapshot } from '../types';

function Kpi({ cls, label, value, sub }: { cls: string; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className={`kpi ${cls}`}>
      <div className="label">{label}</div>
      <div className="val">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Kpis({ snap }: { snap: Snapshot }) {
  const t = snap.totals;
  return (
    <div className="kpis">
      <Kpi cls="k-jobs" label="Jobs ativos" value={<span className="num">{n(t.activeJobs)}</span>} sub={`${n(t.jobs)} no total`} />
      <Kpi cls="k-leads" label="Leads processados" value={<span className="num">{n(t.leads)}</span>} sub={`${n(t.sent)} enviados`} />
      <Kpi cls="k-phone" label="Com telefone" value={<span className="num">{pct(t.pctWithPhone)}</span>} sub={`${n(t.withPhone)} leads`} />
      <Kpi cls="k-wa" label="Com WhatsApp" value={<span className="num">{pct(t.pctWithWhatsapp)}</span>} sub={`${n(t.withWhatsapp)} celulares`} />
      <Kpi cls="k-lat" label="Latência média" value={<span className="num">{avgLat(snap)}</span>} sub="por lead" />
      <Kpi cls="k-score" label="Score médio" value={<span className="num">{n(t.avgScore)}<small>/100</small></span>} sub="qualidade" />
      <Kpi cls="k-err" label="Sem telefone / erros" value={<span className="num">{n(t.withoutPhone)}</span>} sub={`${n(t.errors)} erros · ${n(t.skipped)} pulados`} />
    </div>
  );
}
