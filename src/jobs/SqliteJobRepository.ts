import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Job, LeadRecord } from '../domain/types';
import type { JobRepository } from './JobRepository';
import { SCHEMA } from './schema';

interface JobRow {
  id: string;
  query: string;
  requested: number;
  only_with_phone: number;
  status: string;
  created_at: number;
  phase1_ms: number | null;
  phase2_started_at: number | null;
  finished_at: number | null;
  error: string | null;
  total_found: number;
  counters: string;
  latency: string;
  score: string;
}

interface LeadRow {
  job_id: string;
  name: string;
  phone: string;
  whatsapp: string;
  website: string;
  rating: string;
  reviews: string;
  score: number;
  tier: string;
  breakdown: string;
  ms: number | null;
  created_at: number;
}

export class SqliteJobRepository implements JobRepository {
  private readonly db: Database.Database;
  private readonly upsertJobStmt: Database.Statement;
  private readonly insertLeadStmt: Database.Statement;
  private readonly recentJobsStmt: Database.Statement;
  private readonly leadsByJobStmt: Database.Statement;
  private readonly listLeadsStmt: Database.Statement;
  private readonly countLeadsStmt: Database.Statement;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);

    this.upsertJobStmt = this.db.prepare(`
      INSERT INTO jobs (id, query, requested, only_with_phone, status, created_at,
                        phase1_ms, phase2_started_at, finished_at, error, total_found,
                        counters, latency, score)
      VALUES (@id, @query, @requested, @only_with_phone, @status, @created_at,
              @phase1_ms, @phase2_started_at, @finished_at, @error, @total_found,
              @counters, @latency, @score)
      ON CONFLICT(id) DO UPDATE SET
        status            = excluded.status,
        phase1_ms         = excluded.phase1_ms,
        phase2_started_at = excluded.phase2_started_at,
        finished_at       = excluded.finished_at,
        error             = excluded.error,
        total_found       = excluded.total_found,
        counters          = excluded.counters,
        latency           = excluded.latency,
        score             = excluded.score
    `);

    this.insertLeadStmt = this.db.prepare(`
      INSERT INTO leads (job_id, name, phone, whatsapp, website, rating, reviews,
                         score, tier, breakdown, ms, created_at)
      VALUES (@job_id, @name, @phone, @whatsapp, @website, @rating, @reviews,
              @score, @tier, @breakdown, @ms, @created_at)
    `);

    this.recentJobsStmt = this.db.prepare(
      `SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`,
    );
    this.leadsByJobStmt = this.db.prepare(
      `SELECT * FROM leads WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    );
    this.listLeadsStmt = this.db.prepare(
      `SELECT * FROM leads ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    );
    this.countLeadsStmt = this.db.prepare(`SELECT COUNT(*) AS c FROM leads`);
  }

  saveJob(job: Job): void {
    this.upsertJobStmt.run({
      id: job.id,
      query: job.query,
      requested: job.requested,
      only_with_phone: job.onlyWithPhone ? 1 : 0,
      status: job.status,
      created_at: job.createdAt,
      phase1_ms: job.phase1Ms,
      phase2_started_at: job.phase2StartedAt,
      finished_at: job.finishedAt,
      error: job.error,
      total_found: job.totalFound,
      counters: JSON.stringify(job.counters),
      latency: JSON.stringify(job.latency),
      score: JSON.stringify(job.score),
    });
  }

  insertLead(lead: LeadRecord): void {
    this.insertLeadStmt.run({
      job_id: lead.jobId,
      name: lead.name,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      website: lead.website,
      rating: lead.rating,
      reviews: lead.reviews,
      score: lead.score,
      tier: lead.tier,
      breakdown: JSON.stringify(lead.breakdown),
      ms: lead.ms,
      created_at: lead.at,
    });
  }

  recentJobs(limit: number, leadsPerJob: number): Job[] {
    const rows = this.recentJobsStmt.all(limit) as JobRow[];
    // Devolve em ordem cronológica (mais antigo primeiro), como o Store mantém.
    return rows
      .map((row) => this.rowToJob(row, leadsPerJob))
      .reverse();
  }

  leadsForJob(jobId: string, limit: number, offset: number): LeadRecord[] {
    const rows = this.leadsByJobStmt.all(jobId, limit, offset) as LeadRow[];
    return rows.map((r) => this.rowToLead(r));
  }

  listLeads(limit: number, offset: number): LeadRecord[] {
    const rows = this.listLeadsStmt.all(limit, offset) as LeadRow[];
    return rows.map((r) => this.rowToLead(r));
  }

  countLeads(): number {
    const row = this.countLeadsStmt.get() as { c: number };
    return row.c;
  }

  close(): void {
    this.db.close();
  }

  // --- privados -------------------------------------------------------------

  private rowToJob(row: JobRow, leadsPerJob: number): Job {
    // Últimos N leads em ordem cronológica (o Store guarda mais recente no fim).
    const leads = this.leadsForJob(row.id, leadsPerJob, 0).reverse();
    return {
      id: row.id,
      query: row.query,
      requested: row.requested,
      onlyWithPhone: row.only_with_phone === 1,
      status: row.status as Job['status'],
      createdAt: row.created_at,
      phase1Ms: row.phase1_ms,
      phase2StartedAt: row.phase2_started_at,
      finishedAt: row.finished_at,
      error: row.error,
      totalFound: row.total_found,
      counters: JSON.parse(row.counters) as Job['counters'],
      latency: JSON.parse(row.latency) as Job['latency'],
      score: JSON.parse(row.score) as Job['score'],
      leads,
    };
  }

  private rowToLead(r: LeadRow): LeadRecord {
    return {
      jobId: r.job_id,
      name: r.name,
      phone: r.phone,
      whatsapp: r.whatsapp,
      website: r.website,
      rating: r.rating,
      reviews: r.reviews,
      score: r.score,
      tier: r.tier as LeadRecord['tier'],
      breakdown: JSON.parse(r.breakdown) as LeadRecord['breakdown'],
      ms: r.ms,
      at: r.created_at,
    };
  }
}
