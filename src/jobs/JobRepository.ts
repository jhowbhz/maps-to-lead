import type { Job, LeadRecord } from '../domain/types';

/**
 * Persistência de jobs e leads. Abstrai o SQLite para que o JobStore não
 * conheça o banco (troca de implementação = trocar um adapter).
 */
export interface JobRepository {
  /** Cria/atualiza (upsert) um job pelo id. */
  saveJob(job: Job): void;

  /** Grava um lead extraído. */
  insertLead(lead: LeadRecord): void;

  /** Jobs mais recentes (com seus últimos leads) para hidratar o painel no boot. */
  recentJobs(limit: number, leadsPerJob: number): Job[];

  /** Leads de um job, paginado (mais recentes primeiro). */
  leadsForJob(jobId: string, limit: number, offset: number): LeadRecord[];

  /** Todos os leads (de todos os jobs), paginado (mais recentes primeiro). */
  listLeads(limit: number, offset: number): LeadRecord[];

  /** Total de leads persistidos (para a paginação). */
  countLeads(): number;

  close(): void;
}
