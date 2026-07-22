// Espelha as formas que o backend expõe em /manager/api/state e /manager/api/leads.

export type Tier = 'A' | 'B' | 'C' | 'D';

export interface Counters {
  processed: number;
  sent: number;
  skippedNoPhone: number;
  errors: number;
  withPhone: number;
  withoutPhone: number;
  withWhatsapp: number;
  withWebsite: number;
}

export interface Latency {
  count: number;
  totalMs: number;
  min: number | null;
  max: number | null;
  lastMs: number | null;
  avgMs: number;
}

export interface JobScore {
  sum: number;
  count: number;
  avg: number;
  tiers: Record<Tier, number>;
}

export interface LeadRecord {
  jobId: string;
  name: string;
  phone: string;
  whatsapp: string;
  website: string;
  rating: string;
  reviews: string;
  score: number;
  tier: Tier;
  ms: number | null;
  at: number;
}

export type JobStatus = 'scraping' | 'parsing' | 'done' | 'error';

export interface JobView {
  id: string;
  query: string;
  requested: number;
  onlyWithPhone: boolean;
  status: JobStatus;
  createdAt: number;
  phase1Ms: number | null;
  elapsedMs: number;
  finishedAt: number | null;
  error: string | null;
  totalFound: number;
  progress: number;
  counters: Counters;
  latency: Latency;
  score: JobScore;
  leads: LeadRecord[];
}

export interface SnapshotTotals {
  jobs: number;
  leads: number;
  sent: number;
  withPhone: number;
  withoutPhone: number;
  withWhatsapp: number;
  withWebsite: number;
  skipped: number;
  errors: number;
  activeJobs: number;
  pctWithPhone: number;
  pctWithWhatsapp: number;
  avgScore: number;
}

export interface Snapshot {
  now: number;
  uptimeMs: number;
  totals: SnapshotTotals;
  jobs: JobView[];
  recentLeads: LeadRecord[];
}

export interface LeadsPage {
  leads: LeadRecord[];
  total: number;
  limit: number;
  offset: number;
}
