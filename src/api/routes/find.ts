import { Router } from 'express';
import { config } from '../../config/env';
import type { JobStore } from '../../jobs/JobStore';
import type { GoogleMapsScraper } from '../../scraper/GoogleMapsScraper';
import { validateFind, type FindInput } from '../middleware/validate';

interface FindDeps {
  store: JobStore;
  scraper: GoogleMapsScraper;
}

// Monta a busca do Google Maps a partir de { type, city, state }.
function buildQuery(q: FindInput['query']): string {
  return [q.type, q.city, q.state].map((s) => s.trim()).filter(Boolean).join(', ');
}

// POST /api/find — inicia a busca e responde IMEDIATAMENTE com o jobId. Toda a
// extração (varre tudo na região, extrai e dispara os webhooks) roda em segundo
// plano. Acompanhe o progresso no painel /manager.
export function findRouter({ store, scraper }: FindDeps): Router {
  const router = Router();

  router.post('/api/find', validateFind, (req, res) => {
    const input = res.locals.find as FindInput;
    const query = buildQuery(input.query);

    const job = store.createJob({ query, onlyWithPhone: input.options.onlyWithPhone });
    const reporter = store.reporterFor(job);

    // retry (bool) -> número de retentativas: true usa o padrão do servidor.
    const retries = input.webhook.retry ? config.WEBHOOK_RETRIES : 0;

    // Fire-and-forget: sem await -> resposta instantânea. run() trata
    // reporter.finish/error e fecha o contexto do browser sozinho.
    void scraper.run(
      {
        query,
        webhook: { url: input.webhook.url, retries, timeoutMs: input.webhook.timeout },
        onlyWithPhone: input.options.onlyWithPhone,
        onlyRepeat: input.options.onlyRepeat,
        infosExtras: input.options.onlyInfosExtras,
      },
      reporter,
    );

    res.status(200).json({
      error: false,
      message: 'A busca foi iniciada. Você receberá os resultados no seu webhook em até 5 minutos.',
      jobId: job.id,
      query: input.query,
      options: input.options,
      webhook: input.webhook.url,
    });
  });

  return router;
}
