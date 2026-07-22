import { config } from '../config/env';
import { logger } from '../config/logger';
import type { LeadPayload } from '../domain/types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Cliente de webhook: POST JSON via fetch nativo, com timeout (AbortController)
// e retry com backoff. Nunca lança — devolve true/false — para que uma falha de
// entrega não derrube o dispatcher da Fase 2. Envia UM webhook por lugar.
// ---------------------------------------------------------------------------
export class WebhookClient {
  constructor(
    private readonly timeoutMs: number = config.WEBHOOK_TIMEOUT_MS,
    private readonly retries: number = config.WEBHOOK_RETRIES,
  ) {}

  async send(url: string, payload: LeadPayload): Promise<boolean> {
    const body = JSON.stringify(payload);

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (res.ok) {
          logger.debug({ url, status: res.status }, 'Webhook enviado');
          return true;
        }
        logger.warn({ url, status: res.status }, 'Webhook respondeu com erro HTTP');
      } catch (err) {
        logger.warn({ err, url, attempt }, 'Falha ao enviar webhook');
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.retries) await delay(300 * (attempt + 1));
    }

    return false;
  }
}
