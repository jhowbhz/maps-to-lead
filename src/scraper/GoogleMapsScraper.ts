import { config } from '../config/env';
import { logger } from '../config/logger';
import type { LeadPayload, Place, Reporter } from '../domain/types';
import type { WebhookClient } from '../webhook/WebhookClient';
import type { BrowserManager } from './BrowserManager';
import type { Semaphore } from './Semaphore';
import { enrichLeadFromSite } from './enrich';
import { collectPlaces, performSearch, scrollFeed } from './pages/searchFeed';
import { extractPlaceDetail } from './pages/placeDetail';

// Quantas vezes retentar a navegação da página de detalhe antes de desistir.
const DETAIL_RETRIES = 1;

export interface WebhookConfig {
  url: string;
  retries: number;
  timeoutMs?: number;
}

export interface FindParams {
  query: string;
  webhook: WebhookConfig;
  onlyWithPhone: boolean;
  /** false => NÃO envia empresas com telefone repetido (dedupe). true/omitido => traz tudo. */
  onlyRepeat: boolean;
  /** true => visita o site de cada lead (pool paralelo) e extrai email/redes. */
  infosExtras: boolean;
}

interface Slot {
  promise: Promise<LeadPayload | null>;
  resolve: (payload: LeadPayload | null) => void;
}

function makeSlots(n: number): Slot[] {
  return Array.from({ length: n }, () => {
    let resolve!: (payload: LeadPayload | null) => void;
    const promise = new Promise<LeadPayload | null>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });
}

// ---------------------------------------------------------------------------
// GoogleMapsScraper: roda uma busca por completo em segundo plano.
//   1) rola o feed até o FIM da lista (traz tudo que existir na região);
//   2) EXTRAÇÃO em pool paralelo (Maps) + ENRIQUECIMENTO em pool paralelo próprio
//      (visita o site do lead, opcional) — dois jobs concorrentes que pipelinam;
//   3) DISPATCHER único envia os webhooks na ORDEM ORIGINAL (com dedupe opcional).
//   A resposta HTTP é instantânea — quem chama não dá await aqui.
// ---------------------------------------------------------------------------
export class GoogleMapsScraper {
  constructor(
    private readonly browser: BrowserManager,
    private readonly webhook: WebhookClient,
    private readonly tabs: Semaphore,
  ) {}

  /**
   * Executa o job inteiro (busca -> extração/enriquecimento -> webhooks) em
   * background. Reporta progresso pelo `reporter` e fecha o contexto ao fim.
   * Nunca lança: erros viram reporter.error para não derrubar o processo.
   */
  async run(params: FindParams, reporter: Reporter): Promise<void> {
    const context = await this.browser.newContext();
    try {
      const page = await context.newPage();
      await performSearch(page, params.query);
      await scrollFeed(page); // varre TUDO até o fim da lista
      const places = await collectPlaces(page);
      await page.close().catch(() => {});

      logger.info(`Lugares encontrados na região: ${places.length} (query: ${params.query})`);
      reporter.phase1Done(places.length); // atualiza o painel (não bloqueia o cliente)

      const sent = await this.runPhase2(context, places, params, reporter);
      reporter.finish(sent);
    } catch (err) {
      logger.error({ err, query: params.query }, 'Erro no scrape');
      reporter.error(err);
    } finally {
      await context.close().catch(() => {});
    }
  }

  private async runPhase2(
    context: Awaited<ReturnType<BrowserManager['newContext']>>,
    places: Place[],
    params: FindParams,
    reporter: Reporter,
  ): Promise<number> {
    const total = places.length;
    if (total === 0) return 0;

    const extractConcurrency = Math.max(1, Math.min(config.PARSE_CONCURRENCY, total));

    // Estágio 1: slots de EXTRAÇÃO (Maps). Estágio 2: slots FINAIS (pós-enrich).
    // Sem enriquecimento, o "final" é o próprio "extracted" (não há 2º estágio).
    const extracted = makeSlots(total);
    const final = params.infosExtras ? makeSlots(total) : extracted;

    // POOL DE EXTRAÇÃO — respeita o semáforo GLOBAL de abas.
    let exCursor = 0;
    const extractWorker = async (workerId: number): Promise<void> => {
      while (true) {
        const i = exCursor++;
        if (i >= total) break;
        const place = places[i];
        const slot = extracted[i];
        if (!place || !slot) break;

        let dados: LeadPayload | null = null;
        let errored = false;
        const t0 = Date.now(); // latência da EXTRAÇÃO (o enrich não conta aqui)
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
        slot.resolve(dados);
      }
    };

    // POOL DE ENRIQUECIMENTO (só quando infosExtras) — visita o site em PARALELO,
    // sem segurar aba/semáforo. Consome os leads conforme a extração os libera.
    let enCursor = 0;
    const enrichWorker = async (): Promise<void> => {
      while (true) {
        const i = enCursor++;
        if (i >= total) break;
        const exSlot = extracted[i];
        const fiSlot = final[i];
        if (!exSlot || !fiSlot) break;
        const dados = await exSlot.promise; // espera a extração deste índice
        if (dados) {
          try {
            await enrichLeadFromSite(dados.lead, config.ENRICH_TIMEOUT_MS);
          } catch {
            /* enrich é best-effort */
          }
        }
        fiSlot.resolve(dados);
      }
    };

    const extractPool = Array.from({ length: extractConcurrency }, (_, k) => extractWorker(k + 1));
    const enrichPool = params.infosExtras
      ? Array.from({ length: Math.max(1, Math.min(config.ENRICH_CONCURRENCY, total)) }, () => enrichWorker())
      : [];
    logger.info(
      `Extração: ${total} lugares (${extractConcurrency} abas)` +
        (params.infosExtras ? ` + enriquecimento (${enrichPool.length} paralelos)` : ''),
    );
    const poolDone = Promise.all([...extractPool, ...enrichPool]);

    // DISPATCHER: envia os webhooks NA ORDEM ORIGINAL, esperando o slot FINAL
    // (já enriquecido). Serializar o envio preserva a ordem sem frear os pools.
    const dedupe = params.onlyRepeat === false; // onlyRepeat:false => sem telefones repetidos
    const seenPhones = new Set<string>();
    let sent = 0;
    for (let i = 0; i < total; i++) {
      const slot = final[i];
      if (!slot) continue;
      const dados = await slot.promise; // espera ESTE índice ficar pronto (pós-enrich)
      if (!dados) continue; // pulado (sem telefone) ou erro

      const phone = dados.lead.contacts.phone;
      if (dedupe && phone && seenPhones.has(phone)) {
        logger.debug({ phone }, 'Pulado (telefone repetido)');
        continue;
      }
      if (phone) seenPhones.add(phone);

      const delivered = await this.webhook.send(params.webhook.url, dados, {
        timeoutMs: params.webhook.timeoutMs,
        retries: params.webhook.retries,
      });
      if (delivered) {
        reporter.sent(); // conta só entregas confirmadas (2xx)
        sent += 1;
      }
    }

    await poolDone; // garante que todos os workers (extração + enrich) encerraram
    logger.info(`Extração concluída: ${sent}/${total} enviados`);
    return sent;
  }
}
