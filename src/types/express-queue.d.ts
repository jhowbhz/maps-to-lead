// A lib `express-queue` não publica tipos. Declaração mínima do que usamos:
// um middleware Express que serializa/limita as requisições concorrentes.
declare module 'express-queue' {
  import type { RequestHandler } from 'express';

  interface QueueOptions {
    /** Quantas requisições podem estar ATIVAS ao mesmo tempo. */
    activeLimit?: number;
    /** Tamanho máximo da fila de espera (-1 = ilimitado). */
    queuedLimit?: number;
  }

  function queue(options?: QueueOptions): RequestHandler;
  export = queue;
}
