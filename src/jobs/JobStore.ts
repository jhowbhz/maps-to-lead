import { EventEmitter } from 'node:events';
import { logger } from '../config/logger';
import { scoreLead } from '../domain/scoring';
import type {
  CreateJobInput,
  Job,
  LeadRecord,
  RecordLeadInput,
  Reporter,
  Snapshot,
  JobView,
} from '../domain/types';
import type { JobRepository } from './JobRepository';

const MAX_JOBS = 50; // quantos jobs manter no histórico em memória (ring buffer)
const MAX_RECENT_LEADS = 60; // últimos leads no feed global ao vivo
const MAX_JOB_LEADS = 25; // últimos leads guardados POR job

// ---------------------------------------------------------------------------
// JobStore: estado EM MEMÓRIA do que está rolando + write-through pro SQLite.
//
// É a fonte reativa do painel (snapshot rápido + evento 'update' debounced para
// o SSE). Ao mesmo tempo persiste jobs/leads via JobRepository, para o histórico
// sobreviver a reinícios. Cada chamada de /api/find vira um JOB; o scraper
// reporta cada lead aqui através de um Reporter (callbacks simples).
// ---------------------------------------------------------------------------
export class JobStore extends EventEmitter {
  private startedAt: number | null = null;
  private jobs: Job[] = [];
  private recentLeads: LeadRecord[] = [];
  private seq = 0;
  private emitTimer: NodeJS.Timeout | null = null;

  private totals = {
    jobs: 0, leads: 0, sent: 0,
    withPhone: 0, withoutPhone: 0, withWhatsapp: 0, withWebsite: 0,
    skipped: 0, errors: 0,
  };

  constructor(private readonly repo?: JobRepository) {
    super();
  }

  /** Carrega os jobs recentes do banco para o painel já mostrar histórico. */
  hydrate(): void {
    if (!this.repo) return;
    try {
      const jobs = this.repo.recentJobs(MAX_JOBS, MAX_JOB_LEADS);
      if (!jobs.length) return;
      this.jobs = jobs;
      this.startedAt = Date.now();
      this.recentLeads = jobs
        .flatMap((j) => j.leads)
        .sort((a, b) => a.at - b.at)
        .slice(-MAX_RECENT_LEADS);
      this.recomputeTotals();
      logger.info({ jobs: jobs.length }, 'JobStore hidratado do SQLite');
    } catch (err) {
      logger.warn({ err }, 'Falha ao hidratar JobStore (seguindo vazio)');
    }
  }

  createJob({ query, onlyWithPhone }: CreateJobInput): Job {
    const now = Date.now();
    if (this.startedAt === null) this.startedAt = now;

    this.seq += 1;
    const job: Job = {
      id: `job_${now}_${this.seq}`,
      query: query || '',
      requested: 0, // `qt` foi removido; mantido no schema por compat (sempre 0)
      onlyWithPhone: !!onlyWithPhone,
      status: 'scraping', // scraping -> parsing -> done | error
      createdAt: now,
      phase1Ms: null,
      phase2StartedAt: null,
      finishedAt: null,
      error: null,
      totalFound: 0,
      counters: {
        processed: 0, sent: 0, skippedNoPhone: 0, errors: 0,
        withPhone: 0, withoutPhone: 0, withWhatsapp: 0, withWebsite: 0,
      },
      latency: { count: 0, totalMs: 0, min: null, max: null, lastMs: null, avgMs: 0 },
      score: { sum: 0, count: 0, avg: 0, tiers: { A: 0, B: 0, C: 0, D: 0 } },
      leads: [],
    };

    this.jobs.push(job);
    this.totals.jobs += 1;
    if (this.jobs.length > MAX_JOBS) this.jobs.shift();

    this.persistJob(job);
    this.scheduleEmit();
    return job;
  }

  /** Fim da Fase 1: sabemos quantos lugares existem e começamos a Fase 2. */
  markPhase1Done(job: Job, totalFound: number): void {
    const now = Date.now();
    job.totalFound = totalFound || 0;
    job.phase1Ms = now - job.createdAt;
    job.phase2StartedAt = now;
    job.status = job.totalFound > 0 ? 'parsing' : 'done';
    if (job.status === 'done') job.finishedAt = now;
    this.persistJob(job);
    this.scheduleEmit();
  }

  /** Reporta UM lugar processado na Fase 2 (extração concluída). */
  recordLead(job: Job, { dados, place, ms, errored }: RecordLeadInput): void {
    const c = job.counters;
    c.processed += 1;
    this.totals.leads += 1;

    // Latência (mesmo em pulados/erros a aba foi aberta -> conta o tempo).
    if (typeof ms === 'number' && ms >= 0) {
      const L = job.latency;
      L.count += 1;
      L.totalMs += ms;
      L.lastMs = ms;
      L.min = L.min === null ? ms : Math.min(L.min, ms);
      L.max = L.max === null ? ms : Math.max(L.max, ms);
      L.avgMs = Math.round(L.totalMs / L.count);
    }

    if (errored) {
      c.errors += 1;
      this.totals.errors += 1;
      this.persistJob(job);
      this.scheduleEmit();
      return;
    }

    if (!dados) {
      // Pulado: onlyWithPhone e o lugar não tinha telefone.
      c.skippedNoPhone += 1;
      c.withoutPhone += 1;
      this.totals.skipped += 1;
      this.totals.withoutPhone += 1;
      this.persistJob(job);
      this.scheduleEmit();
      return;
    }

    const src = dados.lead;
    const { phone, whatsapp } = src.contacts;
    const site = src.social.site;
    if (phone) { c.withPhone += 1; this.totals.withPhone += 1; }
    else { c.withoutPhone += 1; this.totals.withoutPhone += 1; }
    if (whatsapp) { c.withWhatsapp += 1; this.totals.withWhatsapp += 1; }
    if (site) { c.withWebsite += 1; this.totals.withWebsite += 1; }

    const s = scoreLead(dados, place);
    job.score.sum += s.score;
    job.score.count += 1;
    job.score.avg = Math.round(job.score.sum / job.score.count);
    job.score.tiers[s.tier] += 1;

    const lead: LeadRecord = {
      jobId: job.id,
      name: src.name || '',
      phone: phone || '',
      whatsapp: whatsapp || '',
      website: site || '',
      rating: place?.rating || '',
      reviews: place?.reviews || '',
      score: s.score,
      tier: s.tier,
      breakdown: s.breakdown,
      ms: typeof ms === 'number' ? ms : null,
      at: Date.now(),
    };

    job.leads.push(lead);
    if (job.leads.length > MAX_JOB_LEADS) job.leads.shift();

    this.recentLeads.push(lead);
    if (this.recentLeads.length > MAX_RECENT_LEADS) this.recentLeads.shift();

    this.persistLead(lead);
    this.persistJob(job);
    this.scheduleEmit();
  }

  /** Webhook enviado com sucesso (dispatcher chama na ordem original). */
  recordSent(job: Job): void {
    job.counters.sent += 1;
    this.totals.sent += 1;
    this.scheduleEmit();
  }

  finishJob(job: Job, sent?: number): void {
    if (typeof sent === 'number') job.counters.sent = sent;
    job.status = 'done';
    job.finishedAt = Date.now();
    this.persistJob(job);
    this.scheduleEmit();
  }

  errorJob(job: Job, err: unknown): void {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err ?? 'erro');
    job.finishedAt = Date.now();
    this.persistJob(job);
    this.scheduleEmit();
  }

  /**
   * Fábrica de reporter: o que o scraper recebe. Mantém o scraper desacoplado
   * do Store (só chama callbacks simples).
   */
  reporterFor(job: Job): Reporter {
    return {
      phase1Done: (total) => this.markPhase1Done(job, total),
      lead: (input) => this.recordLead(job, input),
      sent: () => this.recordSent(job),
      finish: (sent) => this.finishJob(job, sent),
      error: (err) => this.errorJob(job, err),
    };
  }

  /** Snapshot serializável pro dashboard (SSE + carga inicial). */
  snapshot(): Snapshot {
    const now = Date.now();
    const active = this.jobs.filter((j) => j.status === 'scraping' || j.status === 'parsing').length;
    const t = this.totals;
    const processed = t.leads || 0;

    return {
      now,
      uptimeMs: this.startedAt ? now - this.startedAt : 0,
      totals: {
        ...t,
        activeJobs: active,
        pctWithPhone: processed ? Math.round((t.withPhone / processed) * 100) : 0,
        pctWithWhatsapp: processed ? Math.round((t.withWhatsapp / processed) * 100) : 0,
        avgScore: this.avgScoreGlobal(),
      },
      jobs: this.jobs.slice().reverse().map((j) => this.jobView(j, now)),
      recentLeads: this.recentLeads.slice().reverse(),
    };
  }

  // --- privados -------------------------------------------------------------

  // Debounce do broadcast: vários eventos em rajada viram 1 push (evita inundar
  // o SSE quando muitas abas terminam quase juntas).
  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit('update', this.snapshot());
    }, 150);
    if (this.emitTimer.unref) this.emitTimer.unref();
  }

  private persistJob(job: Job): void {
    try {
      this.repo?.saveJob(job);
    } catch (err) {
      logger.warn({ err, jobId: job.id }, 'Falha ao persistir job');
    }
  }

  private persistLead(lead: LeadRecord): void {
    try {
      this.repo?.insertLead(lead);
    } catch (err) {
      logger.warn({ err, jobId: lead.jobId }, 'Falha ao persistir lead');
    }
  }

  private avgScoreGlobal(): number {
    let sum = 0;
    let count = 0;
    for (const j of this.jobs) {
      sum += j.score.sum;
      count += j.score.count;
    }
    return count ? Math.round(sum / count) : 0;
  }

  private recomputeTotals(): void {
    const t = { jobs: 0, leads: 0, sent: 0, withPhone: 0, withoutPhone: 0, withWhatsapp: 0, withWebsite: 0, skipped: 0, errors: 0 };
    for (const j of this.jobs) {
      const c = j.counters;
      t.jobs += 1;
      t.leads += c.processed;
      t.sent += c.sent;
      t.withPhone += c.withPhone;
      t.withoutPhone += c.withoutPhone;
      t.withWhatsapp += c.withWhatsapp;
      t.withWebsite += c.withWebsite;
      t.skipped += c.skippedNoPhone;
      t.errors += c.errors;
    }
    this.totals = t;
  }

  private jobView(j: Job, now: number): JobView {
    const denom = j.totalFound || j.requested || 0;
    const progress = denom ? Math.min(100, Math.round((j.counters.processed / denom) * 100)) : 0;
    const elapsed = (j.finishedAt ?? now) - j.createdAt;
    return {
      id: j.id,
      query: j.query,
      requested: j.requested,
      onlyWithPhone: j.onlyWithPhone,
      status: j.status,
      createdAt: j.createdAt,
      phase1Ms: j.phase1Ms,
      elapsedMs: elapsed,
      finishedAt: j.finishedAt,
      error: j.error,
      totalFound: j.totalFound,
      progress,
      counters: j.counters,
      latency: j.latency,
      score: j.score,
      leads: j.leads.slice().reverse(),
    };
  }
}
