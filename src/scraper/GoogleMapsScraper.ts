import { config } from '../config/env';
import { logger } from '../config/logger';
import type { LeadPayload, Place, Reporter } from '../domain/types';
import type { WebhookClient } from '../webhook/WebhookClient';
import type { BrowserManager } from './BrowserManager';
import type { Semaphore } from './Semaphore';
import { collectPlaces, performSearch, scrollFeed } from './pages/searchFeed';
import { extractPlaceDetail } from './pages/placeDetail';

// Quantas vezes retentar a navegação da página de detalhe antes de desistir.
const DETAIL_RETRIES = 1;

export interface FindParams {
  query: string;
  webhook: string;
  qt: number;
  onlyWithPhone: boolean;
}

interface Slot {
  promise: Promise<LeadPayload | null>;
  resolve: (payload: LeadPayload | null) => void;
}

// ---------------------------------------------------------------------------
// GoogleMapsScraper: orquestra uma busca em duas fases.
//   FASE 1 (síncrona): rola o feed e conta os lugares -> retorna o total.
//   FASE 2 (assíncrona): extrai cada lugar num POOL paralelo e dispara os
//     webhooks num DISPATCHER único que respeita a ORDEM ORIGINAL.
// ---------------------------------------------------------------------------
export class GoogleMapsScraper {
  constructor(
    private readonly browser: BrowserManager,
    private readonly webhook: WebhookClient,
    private readonly tabs: Semaphore,
  ) {}

  /**
   * Roda a Fase 1 e retorna o total encontrado + uma Promise `done` que resolve
   * quando a Fase 2 terminar. O contexto é fechado ao fim (sucesso ou erro).
   */
  async startJob(params: FindParams, reporter: Reporter): Promise<{ total: number; done: Promise<void> }> {
    const context = await this.browser.newContext();

    let places: Place[];
    try {
      const page = await context.newPage();
      await performSearch(page, params.query);
      await scrollFeed(page, params.qt);
      places = await collectPlaces(page, params.qt);
      await page.close().catch(() => {});
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }

    logger.info(`Total disponível na região: ${places.length} (pedido: ${params.qt})`);
    reporter.phase1Done(places.length); // fecha a Fase 1 no painel

    // FASE 2 em segundo plano — não damos await aqui para responder o total já.
    const done = this.runPhase2(context, places, params, reporter)
      .then((sent) => reporter.finish(sent))
      .catch((err) => {
        logger.error({ err }, 'Erro na Fase 2');
        reporter.error(err);
      })
      .finally(() => {
        context.close().catch(() => {});
      });

    return { total: places.length, done };
  }

  // FASE 2 paralela COM ordem preservada:
  //  1) EXTRAÇÃO (cara: abrir aba + ler página) roda num pool de N workers e
  //     pode terminar fora de ordem.
  //  2) ENVIO dos webhooks roda num DISPATCHER único que emite na ORDEM ORIGINAL:
  //     espera o slot i ficar pronto, envia e segue para i+1.
  private async runPhase2(
    context: Awaited<ReturnType<BrowserManager['newContext']>>,
    places: Place[],
    params: FindParams,
    reporter: Reporter,
  ): Promise<number> {
    const total = places.length;
    if (total === 0) return 0;

    const concurrency = Math.max(1, Math.min(config.PARSE_CONCURRENCY, total));

    // Um "slot" por lugar: uma Promise que o worker resolve ao extrair aquele
    // índice (guardando o payload pronto, ou null se pulado/erro).
    const slots: Slot[] = places.map(() => {
      let resolve!: (payload: LeadPayload | null) => void;
      const promise = new Promise<LeadPayload | null>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    });

    // POOL DE EXTRAÇÃO: N workers puxam o próximo índice (cursor++ é atômico no
    // Node single-thread). Cada extração respeita o semáforo GLOBAL de abas.
    let cursor = 0;
    const worker = async (workerId: number): Promise<void> => {
      while (true) {
        const i = cursor++;
        if (i >= total) break;
        const place = places[i];
        const slot = slots[i];
        if (!place || !slot) break;

        let dados: LeadPayload | null = null;
        let errored = false;
        const t0 = Date.now(); // cronometra a latência da extração deste lugar
        try {
          dados = await this.tabs.withPermit(() =>
            extractPlaceDetail(context, place, {
              onlyWithPhone: params.onlyWithPhone,
              retries: DETAIL_RETRIES,
            }),
          );
        } catch (err) {
          errored = true;
          logger.warn({ err, workerId, link: place.link }, 'Erro ao extrair lugar');
        }

        reporter.lead({ dados, place, ms: Date.now() - t0, errored });
        slot.resolve(dados); // libera o slot (null = pulado ou erro)
      }
    };

    logger.info(`Fase 2: ${total} lugares, ${concurrency} em paralelo`);
    const pool = Promise.all(Array.from({ length: concurrency }, (_, k) => worker(k + 1)));

    // DISPATCHER: envia os webhooks NA ORDEM ORIGINAL. Serializar o envio
    // preserva a ordem sem frear a extração, que segue em paralelo no pool.
    let sent = 0;
    for (let i = 0; i < total; i++) {
      const slot = slots[i];
      if (!slot) continue;
      const dados = await slot.promise; // espera ESTE índice ficar pronto
      if (!dados) continue; // pulado (sem telefone) ou erro
      const delivered = await this.webhook.send(params.webhook, dados);
      if (delivered) {
        reporter.sent(); // conta só entregas confirmadas (2xx)
        sent += 1;
      }
    }

    await pool; // garante que todos os workers encerraram
    logger.info(`Fase 2 concluída: ${sent}/${total} enviados`);
    return sent;
  }
}
