// ---------------------------------------------------------------------------
// Erros do SDK. Toda falha de rede/HTTP vira uma instância de MapsToLeadError,
// permitindo `catch (e) { if (e instanceof MapsToLeadError) ... }`.
// ---------------------------------------------------------------------------

export interface MapsToLeadErrorInit {
  /** Código HTTP, quando houve resposta. `0` para falhas de rede/timeout. */
  status?: number;
  /** URL requisitada. */
  url?: string;
  /** Corpo da resposta já parseado (JSON) ou texto cru. */
  body?: unknown;
  /** Erro original (rede/abort), quando aplicável. */
  cause?: unknown;
}

export class MapsToLeadError extends Error {
  /** Código HTTP (0 = falha de rede/timeout, sem resposta). */
  readonly status: number;
  /** URL que falhou. */
  readonly url: string | undefined;
  /** Corpo da resposta (JSON parseado ou texto). */
  readonly body: unknown;

  constructor(message: string, init: MapsToLeadErrorInit = {}) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = 'MapsToLeadError';
    this.status = init.status ?? 0;
    this.url = init.url;
    this.body = init.body;
    // Mantém a cadeia de protótipo correta ao transpilar para ES5/CJS.
    Object.setPrototypeOf(this, MapsToLeadError.prototype);
  }

  /** Verdadeiro para erros de autenticação (401) — token ausente/errado. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Verdadeiro quando o servidor respondeu 429 (rate limit). */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Verdadeiro para falhas de rede/timeout (sem resposta HTTP). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}
