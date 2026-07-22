import { Router } from 'express';
import { logger } from '../../config/logger';
import type { JobStore } from '../../jobs/JobStore';
import type { GoogleMapsScraper } from '../../scraper/GoogleMapsScraper';
import { validateFind, type FindInput } from '../middleware/validate';

interface FindDeps {
  store: JobStore;
  scraper: GoogleMapsScraper;
}

// POST /api/find — abre um job, aguarda a FASE 1 (contagem) e responde o total
// imediatamente. A FASE 2 (extração + webhooks) segue em segundo plano.
export function findRouter({ store, scraper }: FindDeps): Router {
  const router = Router();

  router.post('/api/find', validateFind, async (req, res) => {
    const input = res.locals.find as FindInput;

    const job = store.createJob({ query: input.query, qt: input.qt, onlyWithPhone: input.onlyWithPhone });
    const reporter = store.reporterFor(job);

    let total = 0;
    try {
      // start() rola o feed, descobre quantos lugares existem e retorna esse
      // total. Os webhooks seguem em background (done trata finish/error).
      const { total: found } = await scraper.startJob(
        { query: input.query, webhook: input.webhook, qt: input.qt, onlyWithPhone: input.onlyWithPhone },
        reporter,
      );
      total = found;
    } catch (err) {
      logger.error({ err }, 'Erro no scrape (Fase 1)');
      reporter.error(err);
    }

    // Quando a região tem menos lugares do que o pedido, avisamos o teto real.
    const message =
      total >= input.qt
        ? `Encontramos ${total} lugares. Você receberá os dados em seu webhook em até 5 minutos.`
        : `O limite máximo nesta região é ${total} lugar(es) (você pediu ${input.qt}). Você receberá os ${total} em seu webhook em até 5 minutos.`;

    res.status(200).json({
      error: false,
      message,
      query: input.query,
      requested: input.qt,
      total,
      jobId: job.id,
      onlyWithPhone: input.onlyWithPhone,
      webhook: input.webhook,
    });
  });

  return router;
}
