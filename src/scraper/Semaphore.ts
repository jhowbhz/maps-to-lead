// ---------------------------------------------------------------------------
// Semáforo assíncrono. Limita quantas operações rodam AO MESMO TEMPO. Usado como
// teto GLOBAL de abas de detalhe do processo inteiro (somando todas as
// requisições): sem ele, N requisições concorrentes x PARSE_CONCURRENCY
// multiplicaria as abas e estouraria a memória.
// ---------------------------------------------------------------------------
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.permits = Math.max(1, max);
  }

  /** Pega um permit (ou entra na fila e espera um ser liberado). */
  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Devolve o permit: passa direto pro próximo da fila, ou incrementa o saldo. */
  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits += 1;
  }

  /** Executa `fn` segurando um permit; libera no fim mesmo se der erro. */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
