import { MapsToLeadError } from './errors';
import { parseSseStream } from './sse';
import type {
  FindRequest,
  FindResponse,
  JobLeadsResponse,
  JobsResponse,
  LeadsResponse,
  PageOptions,
  Snapshot,
} from './types';

/** Opções de construção do cliente. */
export interface MapsToLeadOptions {
  /** URL base do servidor Maps to Lead (ex.: `https://seu-host:9000`). */
  baseUrl: string;
  /** MANAGER_TOKEN — obrigatório para os endpoints do painel `/manager`. */
  token?: string;
  /** Timeout padrão por requisição, em ms. Padrão `30000`. `0` desliga. */
  timeoutMs?: number;
  /** Implementação de `fetch` a usar (padrão: `globalThis.fetch`). */
  fetch?: typeof fetch;
  /** Headers extras enviados em toda requisição. */
  headers?: Record<string, string>;
}

/** Opções por requisição. */
export interface RequestOptions {
  /** Cancela a requisição. */
  signal?: AbortSignal;
  /** Sobrescreve o timeout padrão do cliente, em ms. `0` desliga. */
  timeoutMs?: number;
}

/** Opções da assinatura ao stream ao vivo. */
export interface StreamOptions {
  /** Encerra a assinatura. */
  signal?: AbortSignal;
  /** Chamado a cada erro do stream (rede/parse). */
  onError?: (err: unknown) => void;
}

type FetchImpl = typeof fetch;

// ---------------------------------------------------------------------------
// Cliente HTTP da API Maps to Lead. Sem dependências de runtime — usa o `fetch`
// global (Node >= 18.18 ou navegador). Instancie uma vez e reutilize.
// ---------------------------------------------------------------------------
export class MapsToLead {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: FetchImpl | undefined;

  constructor(options: MapsToLeadOptions) {
    if (!options || typeof options.baseUrl !== 'string' || !options.baseUrl.trim()) {
      throw new MapsToLeadError('`baseUrl` é obrigatório ao criar o cliente MapsToLead.');
    }
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
    this.token = options.token?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.defaultHeaders = { ...(options.headers ?? {}) };
    this.fetchImpl =
      options.fetch ??
      (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
  }

  // --- Busca ----------------------------------------------------------------

  /**
   * Inicia uma busca (`POST /api/find`). Responde na hora com o `jobId` — a
   * extração roda em segundo plano e os leads chegam no `webhook.url`.
   * Não exige token.
   */
  async find(input: FindRequest, opts: RequestOptions = {}): Promise<FindResponse> {
    if (!input?.query?.type || !input.query.type.trim()) {
      throw new MapsToLeadError('`query.type` é obrigatório em find().');
    }
    if (!input?.webhook?.url || !input.webhook.url.trim()) {
      throw new MapsToLeadError('`webhook.url` é obrigatório em find().');
    }
    return this.request<FindResponse>('POST', '/api/find', { body: input, opts });
  }

  // --- Painel / histórico (exigem token) ------------------------------------

  /** Snapshot ao vivo do painel (`GET /manager/api/state`). */
  async getState(opts: RequestOptions = {}): Promise<Snapshot> {
    return this.request<Snapshot>('GET', '/manager/api/state', { auth: true, opts });
  }

  /** Histórico de jobs persistidos (`GET /manager/api/jobs`). */
  async getJobs(params: { limit?: number } = {}, opts: RequestOptions = {}): Promise<JobsResponse> {
    return this.request<JobsResponse>('GET', '/manager/api/jobs', {
      auth: true,
      query: { limit: params.limit },
      opts,
    });
  }

  /** Todos os leads persistidos, paginado (`GET /manager/api/leads`). */
  async getLeads(params: PageOptions = {}, opts: RequestOptions = {}): Promise<LeadsResponse> {
    return this.request<LeadsResponse>('GET', '/manager/api/leads', {
      auth: true,
      query: { limit: params.limit, offset: params.offset },
      opts,
    });
  }

  /** Leads de um job específico, paginado (`GET /manager/api/jobs/:id/leads`). */
  async getJobLeads(
    jobId: string,
    params: PageOptions = {},
    opts: RequestOptions = {},
  ): Promise<JobLeadsResponse> {
    if (!jobId || !jobId.trim()) {
      throw new MapsToLeadError('`jobId` é obrigatório em getJobLeads().');
    }
    return this.request<JobLeadsResponse>(
      'GET',
      `/manager/api/jobs/${encodeURIComponent(jobId)}/leads`,
      { auth: true, query: { limit: params.limit, offset: params.offset }, opts },
    );
  }

  /**
   * Exporta todos os leads persistidos como planilha `.xlsx`
   * (`GET /manager/api/leads.xlsx`). Retorna os bytes do arquivo.
   */
  async exportLeadsXlsx(opts: RequestOptions = {}): Promise<Uint8Array> {
    const res = await this.raw('GET', '/manager/api/leads.xlsx', { auth: true, opts });
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // --- Stream ao vivo (SSE) -------------------------------------------------

  /**
   * Assina o stream ao vivo do painel (`GET /manager/stream`) como um async
   * iterator de snapshots. Encerre passando um `AbortSignal` em `opts.signal`
   * ou saindo do `for await`.
   *
   * ```ts
   * for await (const snap of client.streamSnapshots({ signal })) {
   *   console.log(snap.totals.leads);
   * }
   * ```
   */
  async *streamSnapshots(opts: RequestOptions = {}): AsyncGenerator<Snapshot, void, unknown> {
    const url = this.buildUrl('/manager/stream');
    // Stream é de longa duração: sem timeout por padrão (só o signal encerra).
    const timeoutMs = opts.timeoutMs ?? 0;
    const { signal, cancel } = this.withTimeout(opts.signal, timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream', ...this.authHeaders() },
        signal,
      });
    } catch (err) {
      cancel();
      // Parada solicitada pelo próprio consumidor antes de conectar: encerra limpo.
      if (opts.signal?.aborted) return;
      throw err;
    }

    try {
      if (!res.ok) throw await this.toError(res, url);
      if (!res.body) {
        throw new MapsToLeadError('O stream não retornou corpo.', { status: res.status, url });
      }
      for await (const data of parseSseStream(res.body)) {
        yield JSON.parse(data) as Snapshot;
      }
    } catch (err) {
      // Abortar pelo `opts.signal` é a forma normal de encerrar: não é erro.
      if (opts.signal?.aborted) return;
      if (isAbortLike(err)) {
        throw new MapsToLeadError('Stream cancelado ou expirado (timeout).', {
          status: 0,
          url,
          cause: err,
        });
      }
      if (err instanceof MapsToLeadError) throw err;
      throw new MapsToLeadError('Falha ao ler o stream de eventos.', { status: 0, url, cause: err });
    } finally {
      cancel();
      await res.body?.cancel().catch(() => {});
    }
  }

  /**
   * Açúcar sobre {@link streamSnapshots}: chama `handler` a cada snapshot e
   * devolve uma função para encerrar a assinatura.
   */
  onSnapshot(handler: (snap: Snapshot) => void, opts: StreamOptions = {}): () => void {
    const controller = new AbortController();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    void (async () => {
      try {
        for await (const snap of this.streamSnapshots({ signal: controller.signal })) {
          handler(snap);
        }
      } catch (err) {
        if (!controller.signal.aborted) opts.onError?.(err);
      }
    })();
    return () => controller.abort();
  }

  // --- Internos -------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    init: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      auth?: boolean;
      opts?: RequestOptions;
    },
  ): Promise<T> {
    const res = await this.raw(method, path, init);
    return this.json<T>(res);
  }

  private async raw(
    method: string,
    path: string,
    init: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      auth?: boolean;
      opts?: RequestOptions;
    },
  ): Promise<Response> {
    const url = this.buildUrl(path, init.query);
    const opts = init.opts ?? {};
    const { signal, cancel } = this.withTimeout(opts.signal, opts.timeoutMs ?? this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...(init.auth ? this.authHeaders() : {}),
    };
    let payload: string | undefined;
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(init.body);
    }

    try {
      const res = await this.doFetch(url, { method, headers, body: payload, signal });
      if (!res.ok) throw await this.toError(res, url);
      return res;
    } finally {
      cancel();
    }
  }

  private async doFetch(url: string, reqInit: RequestInit): Promise<Response> {
    if (!this.fetchImpl) {
      throw new MapsToLeadError(
        'Nenhuma implementação de `fetch` disponível. Use Node >= 18.18 ou passe `fetch` nas opções.',
      );
    }
    try {
      return await this.fetchImpl(url, reqInit);
    } catch (err) {
      if (err instanceof MapsToLeadError) throw err;
      const aborted = isAbortLike(err);
      throw new MapsToLeadError(
        aborted
          ? 'Requisição cancelada ou expirada (timeout).'
          : 'Falha de rede ao contatar a API Maps to Lead.',
        { status: 0, url, cause: err },
      );
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) {
      throw new MapsToLeadError(
        'Este endpoint requer o MANAGER_TOKEN. Passe `{ token }` ao criar o cliente MapsToLead.',
      );
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  private async json<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new MapsToLeadError('Resposta da API não é JSON válido.', {
        status: res.status,
        body: text,
        cause: err,
      });
    }
  }

  private async toError(res: Response, url: string): Promise<MapsToLeadError> {
    let body: unknown;
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `Requisição falhou com HTTP ${res.status}.`;
    return new MapsToLeadError(message, { status: res.status, url, body });
  }

  /** Combina o signal do usuário com um timeout num único AbortSignal. */
  private withTimeout(
    userSignal: AbortSignal | undefined,
    timeoutMs: number,
  ): { signal: AbortSignal; cancel: () => void } {
    const controller = new AbortController();
    const onAbort = () => controller.abort((userSignal as AbortSignal).reason);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        timeoutMs,
      );
      (timer as { unref?: () => void }).unref?.();
    }
    if (userSignal) {
      if (userSignal.aborted) controller.abort(userSignal.reason);
      else userSignal.addEventListener('abort', onAbort, { once: true });
    }

    const cancel = () => {
      if (timer) clearTimeout(timer);
      userSignal?.removeEventListener('abort', onAbort);
    };
    return { signal: controller.signal, cancel };
  }
}

function isAbortLike(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'name' in err &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}
