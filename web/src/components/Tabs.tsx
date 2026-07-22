import { n } from '../format';

export type TabKey = 'jobs' | 'leads';

interface TabsProps {
  active: TabKey;
  jobsCount: number;
  leadsCount: number;
  onChange: (tab: TabKey) => void;
}

export function Tabs({ active, jobsCount, leadsCount, onChange }: TabsProps) {
  return (
    <div className="tabs">
      <button type="button" className={`tab${active === 'jobs' ? ' active' : ''}`} onClick={() => onChange('jobs')}>
        Processos <span className="tab-count">{n(jobsCount)}</span>
      </button>
      <button type="button" className={`tab${active === 'leads' ? ' active' : ''}`} onClick={() => onChange('leads')}>
        Leads <span className="tab-count">{n(leadsCount)}</span>
      </button>
    </div>
  );
}
