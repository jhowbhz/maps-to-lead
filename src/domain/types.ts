// ---------------------------------------------------------------------------
// Tipos compartilhados do domínio. Sem lógica aqui — só as formas dos dados
// que atravessam scraper -> jobs -> api -> webhook.
// ---------------------------------------------------------------------------

/** Item bruto coletado do feed de resultados (Fase 1). */
export interface Place {
  name: string;
  rating: string;
  reviews: string;
  price: string;
  link: string;
  image: string;
}

/** O que a página de DETALHE devolve, ainda cru (Fase 2). */
export interface PlaceDetail {
  name: string;
  address: string;
  phone: string;
  website: string;
}

/** Endereço brasileiro já quebrado em partes. */
export interface Address {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  full: string;
}

/** Lead já estruturado (vai aninhado no payload do webhook). */
export interface Lead {
  name: string;
  rating: string;
  pic: string;
  address: Address;
  phone: string;
  whatsapp: string;
  website: string;
}

/** Payload final enviado ao webhook do cliente. */
export interface LeadPayload {
  lead: Lead;
  infos: string[];
}

// --- Score ------------------------------------------------------------------

export type Tier = 'A' | 'B' | 'C' | 'D';

export interface ScoreBreakdown {
  phone: number;
  whatsapp: number;
  website: number;
  rating: number;
  reviews: number;
  address: number;
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  breakdown: ScoreBreakdown;
}

// --- Jobs -------------------------------------------------------------------

export type JobStatus = 'scraping' | 'parsing' | 'done' | 'error';

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

/** Lead resumido guardado no feed ao vivo e persistido no SQLite. */
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
  breakdown: ScoreBreakdown;
  ms: number | null;
  at: number;
}

export interface Job {
  id: string;
  query: string;
  requested: number;
  onlyWithPhone: boolean;
  status: JobStatus;
  createdAt: number;
  phase1Ms: number | null;
  phase2StartedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  totalFound: number;
  counters: Counters;
  latency: Latency;
  score: JobScore;
  leads: LeadRecord[];
}

export interface CreateJobInput {
  query: string;
  qt: number;
  onlyWithPhone: boolean;
}

/** O que o scraper reporta por lugar processado na Fase 2. */
export interface RecordLeadInput {
  dados: LeadPayload | null;
  place: Place;
  ms: number;
  errored: boolean;
}

/**
 * Callbacks que o scraper usa para reportar progresso ao Store, sem conhecer o
 * Store. Mantém o scraper desacoplado da observabilidade/persistência.
 */
export interface Reporter {
  phase1Done(total: number): void;
  lead(input: RecordLeadInput): void;
  sent(): void;
  finish(sent: number): void;
  error(err: unknown): void;
}

// --- Snapshot (o que o painel consome) --------------------------------------

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

/** Contadores acumulados do processo (diferente de Counters, que é por job). */
export interface Totals {
  jobs: number;
  leads: number;
  sent: number;
  withPhone: number;
  withoutPhone: number;
  withWhatsapp: number;
  withWebsite: number;
  skipped: number;
  errors: number;
}

export interface SnapshotTotals extends Totals {
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
