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
  tier: string;
  breakdown: string;
  site_visitado: number;
  campos_encontrados: string;
  pic: string;
  ms: number | null;
  created_at: number;
}

// Colunas de `leads` adicionadas depois do schema original — usadas na migração
// de bancos já existentes (ALTER TABLE idempotente).
const LEAD_MIGRATIONS: Record<string, string> = {
  ddd: "TEXT NOT NULL DEFAULT ''",
  email: "TEXT NOT NULL DEFAULT ''",
  instagram: "TEXT NOT NULL DEFAULT ''",
  facebook: "TEXT NOT NULL DEFAULT ''",
  street: "TEXT NOT NULL DEFAULT ''",
  number: "TEXT NOT NULL DEFAULT ''",
  neighborhood: "TEXT NOT NULL DEFAULT ''",
  city: "TEXT NOT NULL DEFAULT ''",
  uf: "TEXT NOT NULL DEFAULT ''",
  cep: "TEXT NOT NULL DEFAULT ''",
  address: "TEXT NOT NULL DEFAULT ''",
  site_visitado: 'INTEGER NOT NULL DEFAULT 0',
  campos_encontrados: "TEXT NOT NULL DEFAULT '[]'",
  pic: "TEXT NOT NULL DEFAULT ''",
};

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
    this.migrateLeads(); // adiciona colunas novas em bancos antigos

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
      INSERT INTO leads (job_id, name, phone, whatsapp, ddd, email, instagram, facebook, website,
                         street, number, neighborhood, city, uf, cep, address,
                         rating, reviews, score, tier, breakdown, site_visitado,
                         campos_encontrados, pic, ms, created_at)
      VALUES (@job_id, @name, @phone, @whatsapp, @ddd, @email, @instagram, @facebook, @website,
              @street, @number, @neighborhood, @city, @uf, @cep, @address,
              @rating, @reviews, @score, @tier, @breakdown, @site_visitado,
              @campos_encontrados, @pic, @ms, @created_at)
    `);

    this.recentJobsStmt = this.db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`);
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
      ddd: lead.ddd,
      email: lead.email,
      instagram: lead.instagram,
      facebook: lead.facebook,
      website: lead.website,
      street: lead.street,
      number: lead.number,
      neighborhood: lead.neighborhood,
      city: lead.city,
      uf: lead.uf,
      cep: lead.cep,
      address: lead.address,
      rating: lead.rating,
      reviews: lead.reviews,
      score: lead.score,
      tier: lead.tier,
      breakdown: JSON.stringify(lead.breakdown),
      site_visitado: lead.siteVisitado ? 1 : 0,
      campos_encontrados: JSON.stringify(lead.camposEncontrados),
      pic: lead.pic,
      ms: lead.ms,
      created_at: lead.at,
    });
  }

  recentJobs(limit: number, leadsPerJob: number): Job[] {
    const rows = this.recentJobsStmt.all(limit) as JobRow[];
    // Devolve em ordem cronológica (mais antigo primeiro), como o Store mantém.
    return rows.map((row) => this.rowToJob(row, leadsPerJob)).reverse();
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

  private migrateLeads(): void {
    const existing = new Set(
      (this.db.prepare('PRAGMA table_info(leads)').all() as Array<{ name: string }>).map((r) => r.name),
    );
    for (const [column, ddl] of Object.entries(LEAD_MIGRATIONS)) {
      if (!existing.has(column)) this.db.exec(`ALTER TABLE leads ADD COLUMN ${column} ${ddl}`);
    }
  }

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
      ddd: r.ddd,
      email: r.email,
      instagram: r.instagram,
      facebook: r.facebook,
      website: r.website,
      street: r.street,
      number: r.number,
      neighborhood: r.neighborhood,
      city: r.city,
      uf: r.uf,
      cep: r.cep,
      address: r.address,
      rating: r.rating,
      reviews: r.reviews,
      score: r.score,
      tier: r.tier as LeadRecord['tier'],
      breakdown: JSON.parse(r.breakdown) as LeadRecord['breakdown'],
      siteVisitado: r.site_visitado === 1,
      camposEncontrados: JSON.parse(r.campos_encontrados) as string[],
      pic: r.pic,
      ms: r.ms,
      at: r.created_at,
    };
  }
}
