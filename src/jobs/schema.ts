// Schema do SQLite. Campos "planos" (consultáveis) viram colunas; as estruturas
// aninhadas (counters/latency/score/breakdown) são guardadas como JSON em TEXT.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY,
  query             TEXT    NOT NULL DEFAULT '',
  requested         INTEGER NOT NULL DEFAULT 0,
  only_with_phone   INTEGER NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'scraping',
  created_at        INTEGER NOT NULL,
  phase1_ms         INTEGER,
  phase2_started_at INTEGER,
  finished_at       INTEGER,
  error             TEXT,
  total_found       INTEGER NOT NULL DEFAULT 0,
  counters          TEXT    NOT NULL DEFAULT '{}',
  latency           TEXT    NOT NULL DEFAULT '{}',
  score             TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS leads (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id             TEXT    NOT NULL,
  name               TEXT    NOT NULL DEFAULT '',
  phone              TEXT    NOT NULL DEFAULT '',
  whatsapp           TEXT    NOT NULL DEFAULT '',
  ddd                TEXT    NOT NULL DEFAULT '',
  email              TEXT    NOT NULL DEFAULT '',
  instagram          TEXT    NOT NULL DEFAULT '',
  facebook           TEXT    NOT NULL DEFAULT '',
  website            TEXT    NOT NULL DEFAULT '',
  street             TEXT    NOT NULL DEFAULT '',
  number             TEXT    NOT NULL DEFAULT '',
  neighborhood       TEXT    NOT NULL DEFAULT '',
  city               TEXT    NOT NULL DEFAULT '',
  uf                 TEXT    NOT NULL DEFAULT '',
  cep                TEXT    NOT NULL DEFAULT '',
  address            TEXT    NOT NULL DEFAULT '',
  rating             TEXT    NOT NULL DEFAULT '',
  reviews            TEXT    NOT NULL DEFAULT '',
  score              INTEGER NOT NULL DEFAULT 0,
  tier               TEXT    NOT NULL DEFAULT 'D',
  breakdown          TEXT    NOT NULL DEFAULT '{}',
  site_visitado      INTEGER NOT NULL DEFAULT 0,
  campos_encontrados TEXT    NOT NULL DEFAULT '[]',
  pic                TEXT    NOT NULL DEFAULT '',
  ms                 INTEGER,
  created_at         INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_leads_job_id ON leads(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
`;
