import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import queue from 'express-queue';
import { logger } from '../config/logger';
import type { JobRepository } from '../jobs/JobRepository';
import type { JobStore } from '../jobs/JobStore';
import type { GoogleMapsScraper } from '../scraper/GoogleMapsScraper';
import { findRouter } from './routes/find';
import { managerRouter } from './routes/manager';

export interface ServerDeps {
  store: JobStore;
  scraper: GoogleMapsScraper;
  repo: JobRepository;
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: true, message: 'Rota não encontrada.' });
};

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, 'Erro não tratado na request');
  if (res.headersSent) return;
  res.status(500).json({ error: true, message: 'Erro interno.' });
};

export function createServer({ store, scraper, repo }: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // CORS antes de tudo, pra valer inclusive nas rotas do painel.
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Manager-Token',
    );
    next();
  });

  // Painel registrado ANTES da fila: o SSE mantém a conexão aberta e, se
  // passasse pela fila (activeLimit), ocuparia um slot pra sempre.
  app.use(managerRouter({ store, repo }));

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
    res.end('Nice! Go to <a href="/api/find">/api/find</a> — painel: <a href="/manager">/manager</a>');
  });

  // A partir daqui, tudo passa pela fila (scraping pesado).
  app.use(queue({ activeLimit: 2, queuedLimit: -1 }));
  app.use(findRouter({ store, scraper }));

  app.use(notFound);
  app.use(onError);

  return app;
}
