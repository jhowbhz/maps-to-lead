import { createServer } from './api/server';
import { config } from './config/env';
import { logger } from './config/logger';
import { JobStore } from './jobs/JobStore';
import { SqliteJobRepository } from './jobs/SqliteJobRepository';
import { BrowserManager } from './scraper/BrowserManager';
import { GoogleMapsScraper } from './scraper/GoogleMapsScraper';
import { Semaphore } from './scraper/Semaphore';
import { WebhookClient } from './webhook/WebhookClient';

// ---------------------------------------------------------------------------
// Composition root: instancia e conecta todas as camadas, sobe o servidor e
// cuida do encerramento gracioso (fecha o browser e o banco).
// ---------------------------------------------------------------------------
function main(): void {
  const repo = new SqliteJobRepository(config.paths.db);
  const store = new JobStore(repo);
  store.hydrate(); // painel já mostra o histórico persistido

  const browser = new BrowserManager();
  const webhook = new WebhookClient();
  const tabs = new Semaphore(config.MAX_CONCURRENCY); // teto GLOBAL de abas
  const scraper = new GoogleMapsScraper(browser, webhook, tabs);

  const app = createServer({ store, scraper, repo });
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`App na porta ${config.PORT} (host ${config.HOST}). Painel em /manager`);
  });

  // --- Encerramento gracioso ---
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Encerrando...');
    server.close();
    await browser.close();
    try {
      repo.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Redes de segurança: nunca deixar um erro do scraping derrubar a API.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
  });
}

main();
