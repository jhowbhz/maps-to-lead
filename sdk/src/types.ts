// ---------------------------------------------------------------------------
// Tipos públicos do SDK. Espelham as formas de dados que a API Maps to Lead
// expõe (request de POST /api/find e as respostas do painel /manager).
// Mantidos sincronizados com `src/domain/types.ts` do servidor.
// ---------------------------------------------------------------------------

// --- Requisição de busca (POST /api/find) -----------------------------------

/** Ramo/palavra-chave + localização, que viram a busca do Google Maps. */
export interface FindQuery {
  /** Ramo/palavra-chave (ex.: `software`, `restaurante`, `mecânica`). Obrigatório. */
  type: string;
  /** Cidade/bairro. Opcional. */
  city?: string;
  /** Estado/UF. Opcional. */
  state?: string;
}

/** Destino e política de entrega dos leads. */
export interface FindWebhook {
  /** URL que receberá os leads (um POST por lead). Obrigatório. */
  url: string;
  /** `false` = sem retentativas. Padrão do servidor: `true`. */
  retry?: boolean;
  /** Timeout por POST ao webhook, em ms (1000–120000). */
  timeout?: number;
}

/** Opções de filtragem/enriquecimento da busca. */
export interface FindOptions {
  /** Ignora lugares sem telefone. Padrão `false`. */
  onlyWithPhone?: boolean;
  /** `false` = não envia telefones repetidos (dedupe). Padrão `true`. */
  onlyRepeat?: boolean;
  /** `true` = visita o site do lead e extrai email/redes. Padrão `false`. */
  onlyInfosExtras?: boolean;
}

/** Corpo de `POST /api/find`. */
export interface FindRequest {
  query: FindQuery;
  webhook: FindWebhook;
  options?: FindOptions;
}

/** Resposta (instantânea) de `POST /api/find`. */
export interface FindResponse {
  error: false;
  message: string;
  jobId: string;
  query: FindQuery;
  options: Required<FindOptions>;
  webhook: string;
}

// --- Lead -------------------------------------------------------------------

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

/** Nota do lugar: nota (0–5) + quantidade de avaliações. */
export interface Rating {
  note: string;
  quantity: number;
}

/** Contatos do lead. `ddd` é derivado do telefone; `email` não vem do Maps. */
export interface Contacts {
  phone: string;
  whatsapp: string;
  ddd: string;
  email: string;
}

/** Redes/site. `instagram`/`facebook` podem vir do link do Maps ou do site. */
export interface Social {
  instagram: string;
  facebook: string;
  site: string;
}

/** Informações extras extraídas do SITE do lead (quando `onlyInfosExtras`). */
export interface Extra {
  site_visitado: boolean;
  campos_encontrados: string[];
  email: string;
  instagram: string;
  facebook: string;
}

/** Lead já estruturado (vai aninhado no payload do webhook). */
export interface Lead {
  name: string;
  pic: string;
  rating: Rating;
  address: Address;
  contacts: Contacts;
  social: Social;
  extra: Extra;
}

/** Payload enviado ao webhook do cliente (um por lead). */
export interface LeadPayload {
  lead: Lead;
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

// --- Jobs / painel ----------------------------------------------------------

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

/** Lead persistido (retornado pelas rotas de histórico do painel). */
export interface LeadRecord {
  jobId: string;
  name: string;
  phone: string;
  whatsapp: string;
  ddd: string;
  email: string;
  instagram: string;
  facebook: string;
  website: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  address: string;
  rating: string;
  reviews: string;
  score: number;
  tier: Tier;
  breakdown: ScoreBreakdown;
  siteVisitado: boolean;
  camposEncontrados: string[];
  pic: string;
  ms: number | null;
  at: number;
}

/** Job persistido (retornado por `GET /manager/api/jobs`). */
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

/** Job com progresso calculado (o que o snapshot ao vivo carrega). */
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

/** Estado ao vivo do painel (`GET /manager/api/state` e stream SSE). */
export interface Snapshot {
  now: number;
  uptimeMs: number;
  totals: SnapshotTotals;
  jobs: JobView[];
  recentLeads: LeadRecord[];
}

// --- Respostas paginadas do painel ------------------------------------------

export interface JobsResponse {
  jobs: Job[];
}

export interface LeadsResponse {
  leads: LeadRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobLeadsResponse {
  leads: LeadRecord[];
}

// --- Opções de paginação ----------------------------------------------------

export interface PageOptions {
  /** Quantos itens por página. */
  limit?: number;
  /** Deslocamento (a partir de qual item). */
  offset?: number;
}
