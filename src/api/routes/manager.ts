import path from 'node:path';
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import type { Snapshot } from '../../domain/types';
import type { JobRepository } from '../../jobs/JobRepository';
import type { JobStore } from '../../jobs/JobStore';
import { requireToken } from '../middleware/auth';

// Teto de linhas ao exportar (evita estourar memória num export gigante).
const EXPORT_CAP = 100_000;

interface ManagerDeps {
  store: JobStore;
  repo: JobRepository;
}

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(n, max));
}

// ---------------------------------------------------------------------------
// Painel de monitoramento ao vivo. As rotas do painel NÃO passam pela fila de
// scraping (registradas antes do queueMw): o SSE mantém a conexão aberta e
// travaria um slot pra sempre se entrasse na fila.
// ---------------------------------------------------------------------------
export function managerRouter({ store, repo }: ManagerDeps): Router {
  const router = Router();

  // Página do painel (o HTML não tem segredo; quem gateia os dados é o token).
  router.get('/manager', (_req, res) => {
    res.sendFile(path.join(config.paths.public, 'manager.html'));
  });

  // Carga inicial / fallback por polling: snapshot completo em JSON.
  router.get('/manager/api/state', requireToken, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(store.snapshot());
  });

  // Histórico persistido (SQLite): lista de jobs recentes (sem leads).
  router.get('/manager/api/jobs', requireToken, (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 200);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ jobs: repo.recentJobs(limit, 0) });
  });

  // Histórico persistido: TODOS os leads (paginado, mais recentes primeiro).
  router.get('/manager/api/leads', requireToken, (req, res) => {
    const limit = clampInt(req.query.limit, 12, 1, 100);
    const offset = clampInt(req.query.offset, 0, 0, 10_000_000);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ leads: repo.listLeads(limit, offset), total: repo.countLeads(), limit, offset });
  });

  // Exporta TODOS os leads persistidos como planilha .xlsx.
  router.get('/manager/api/leads.xlsx', requireToken, async (_req, res) => {
    try {
      const leads = repo.listLeads(EXPORT_CAP, 0);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'maps-to-lead';
      const ws = wb.addWorksheet('Leads');
      ws.columns = [
        { header: 'Nome', key: 'name', width: 34 },
        { header: 'Telefone', key: 'phone', width: 18 },
        { header: 'WhatsApp', key: 'whatsapp', width: 18 },
        { header: 'Site', key: 'website', width: 34 },
        { header: 'Nota', key: 'rating', width: 8 },
        { header: 'Avaliações', key: 'reviews', width: 12 },
        { header: 'Score', key: 'score', width: 8 },
        { header: 'Tier', key: 'tier', width: 6 },
        { header: 'Latência (ms)', key: 'ms', width: 13 },
        { header: 'Job', key: 'jobId', width: 24 },
        { header: 'Quando', key: 'at', width: 22 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const l of leads) {
        ws.addRow({
          name: l.name, phone: l.phone, whatsapp: l.whatsapp, website: l.website,
          rating: l.rating, reviews: l.reviews, score: l.score, tier: l.tier,
          ms: l.ms, jobId: l.jobId, at: new Date(l.at),
        });
      }

      const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');
      res.send(Buffer.from(buf));
    } catch (err) {
      logger.error({ err }, 'Falha ao gerar XLSX');
      res.status(500).json({ error: true, message: 'Falha ao gerar a planilha.' });
    }
  });

  // Histórico persistido: leads de um job (paginado, mais recentes primeiro).
  router.get('/manager/api/jobs/:id/leads', requireToken, (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ leads: repo.leadsForJob(req.params.id ?? '', limit, offset) });
  });

  // Stream ao vivo (Server-Sent Events): empurra um snapshot a cada atualização.
  router.get('/manager/stream', requireToken, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desliga buffer de proxies (nginx)
    res.flushHeaders?.();

    const send = (snap: Snapshot) => {
      try {
        res.write(`data: ${JSON.stringify(snap)}\n\n`);
      } catch {
        /* conexão caiu */
      }
    };

    send(store.snapshot()); // estado atual imediatamente
    const onUpdate = (snap: Snapshot) => send(snap);
    store.on('update', onUpdate);

    // Keep-alive: comentário SSE a cada 25s pra proxies não derrubarem.
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 25000);
    ping.unref?.();

    req.on('close', () => {
      clearInterval(ping);
      store.removeListener('update', onUpdate);
    });
  });

  return router;
}
