import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

// Raiz do projeto: este arquivo vive em <root>/src/config (ou <root>/dist/config
// depois do build); em ambos os casos `../..` aponta para a raiz.
const ROOT = path.resolve(__dirname, '..', '..');

// Aceita "1", "true", "yes", "on" (case-insensitive) como verdadeiro.
const boolFromEnv = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return def;
    if (typeof v === 'boolean') return v;
    return /^(1|true|yes|on)$/i.test(String(v));
  }, z.boolean());

// Inteiro com default e faixa; valores vazios/invalidos caem no default.
const intFromEnv = (def: number, min: number, max: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return def;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? def : n;
  }, z.number().int().min(min).max(max));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: intFromEnv(9000, 1, 65535),

  // Painel de monitoramento (/manager). Vazio = painel desabilitado (503).
  MANAGER_TOKEN: z.string().default(''),

  // Seletores do Google Maps. Padrões baseados em atributos estáveis
  // (href/aria/role); só sobrescreva se o Google mudar algo estrutural.
  LISTING: z.string().default('a[href^="https://www.google.com/maps/place/"]'),
  SCROLL: z.string().default('[role="feed"]'),

  // Paralelismo da Fase 2. PARSE_CONCURRENCY = abas por requisição;
  // MAX_CONCURRENCY = teto GLOBAL de abas somando todas as requisições.
  PARSE_CONCURRENCY: intFromEnv(4, 1, 12),
  MAX_CONCURRENCY: intFromEnv(8, 1, 32),

  // Persistência (SQLite).
  DB_PATH: z.string().default(path.join(ROOT, 'data', 'leads.db')),

  // Browser / navegação.
  HEADLESS: boolFromEnv(true),
  BLOCK_RESOURCES: boolFromEnv(true),
  NAV_TIMEOUT_MS: intFromEnv(30000, 1000, 120000),
  DETAIL_TIMEOUT_MS: intFromEnv(15000, 1000, 120000),

  // Webhooks.
  WEBHOOK_TIMEOUT_MS: intFromEnv(15000, 1000, 120000),
  WEBHOOK_RETRIES: intFromEnv(2, 0, 10),

  // Enriquecimento (por requisição, via options.onlyInfosExtras): visita o site
  // do lead para achar email/instagram/facebook, num POOL paralelo próprio.
  ENRICH_TIMEOUT_MS: intFromEnv(5000, 1000, 60000),
  ENRICH_CONCURRENCY: intFromEnv(4, 1, 16),

  LOG_LEVEL: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  isProd: parsed.NODE_ENV === 'production',
  paths: {
    root: ROOT,
    public: path.join(ROOT, 'public'),
    db: parsed.DB_PATH,
  },
} as const;

export type Config = typeof config;
