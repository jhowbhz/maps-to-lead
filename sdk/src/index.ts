// ---------------------------------------------------------------------------
// @jhowbhz/maps-to-lead — SDK cliente da API Maps to Lead.
// ---------------------------------------------------------------------------

export { MapsToLead } from './client';
export type { MapsToLeadOptions, RequestOptions, StreamOptions } from './client';

export { MapsToLeadError } from './errors';
export type { MapsToLeadErrorInit } from './errors';

export type {
  // requisição
  FindQuery,
  FindWebhook,
  FindOptions,
  FindRequest,
  FindResponse,
  // lead
  Address,
  Rating,
  Contacts,
  Social,
  Extra,
  Lead,
  LeadPayload,
  // score
  Tier,
  ScoreBreakdown,
  // jobs / painel
  JobStatus,
  Counters,
  Latency,
  JobScore,
  LeadRecord,
  Job,
  JobView,
  Totals,
  SnapshotTotals,
  Snapshot,
  // respostas
  JobsResponse,
  LeadsResponse,
  JobLeadsResponse,
  PageOptions,
} from './types';
