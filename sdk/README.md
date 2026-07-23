# @jhowbhz/maps-to-lead

SDK cliente (TypeScript/JavaScript) para a API **[Maps to Lead](https://github.com/jhowbhz/maps-to-lead)** — prospecção de leads a partir do Google Maps: nome, telefone, WhatsApp, site, endereço e (opcional) email/redes.

> ⚠️ **Não apoiamos nem incentivamos a prática de SPAM.** Utilize com sabedoria e respeite a LGPD/GDPR e os termos de uso das plataformas.

- **Zero dependências** de runtime — usa o `fetch` nativo.
- **TypeScript** com tipos completos (ESM + CommonJS).
- Cobre `POST /api/find` e todo o painel `/manager` (state, jobs, leads, export `.xlsx`, stream ao vivo por SSE).

Este pacote é um **cliente HTTP**: ele fala com um servidor Maps to Lead que você mesmo hospeda (via Docker ou código). Ele **não** faz o scraping localmente. Suba o servidor primeiro — veja o [README do projeto](https://github.com/jhowbhz/maps-to-lead#readme).

## Requisitos

- **Node.js >= 18.18** (para o `fetch` global) ou qualquer navegador moderno.
- Uma instância da API Maps to Lead acessível (ex.: `http://localhost:9000`).
- O `MANAGER_TOKEN` do servidor — necessário apenas para os endpoints do painel.

## Instalação

```bash
npm install @jhowbhz/maps-to-lead
# ou
pnpm add @jhowbhz/maps-to-lead
# ou
yarn add @jhowbhz/maps-to-lead
```

## Início rápido

```ts
import { MapsToLead } from '@jhowbhz/maps-to-lead';

const client = new MapsToLead({
  baseUrl: 'http://localhost:9000',
  token: process.env.MANAGER_TOKEN, // opcional (só o painel exige)
});

// Inicia a busca — responde na hora com o jobId. Os leads chegam no webhook.
const job = await client.find({
  query:   { type: 'software', city: 'centro', state: 'rio de janeiro' },
  webhook: { url: 'https://webhook.site/seu-id', retry: false, timeout: 6000 },
  options: { onlyWithPhone: true, onlyRepeat: false, onlyInfosExtras: true },
});

console.log(job.jobId); // ex.: "job_1737500000000_1"
```

CommonJS também funciona:

```js
const { MapsToLead } = require('@jhowbhz/maps-to-lead');
```

## Configuração do cliente

```ts
new MapsToLead({
  baseUrl: 'https://seu-host:9000', // obrigatório
  token: 'MANAGER_TOKEN',           // opcional — exigido pelos endpoints /manager
  timeoutMs: 30000,                 // opcional — timeout padrão por request (0 desliga)
  headers: { 'X-Custom': '1' },     // opcional — headers extras em toda request
  fetch: customFetch,               // opcional — injeta um fetch (ex.: node-fetch, proxy)
});
```

## API

Todos os métodos aceitam um último parâmetro opcional `{ signal, timeoutMs }` para cancelamento e timeout por chamada.

### `find(input)` — inicia uma busca

Não exige token. Responde instantaneamente; a extração roda em segundo plano no servidor e cada lead é entregue via `POST` no seu `webhook.url`.

```ts
const res = await client.find({
  query:   { type: 'restaurante', city: 'savassi', state: 'MG' },
  webhook: { url: 'https://meu-endpoint/webhook' },
  options: { onlyWithPhone: true },
});
// res => { error: false, message, jobId, query, options, webhook }
```

| Campo                     | Tipo    | Obrigatório | Descrição                                                     |
|---------------------------|---------|-------------|---------------------------------------------------------------|
| `query.type`              | string  | ✅          | ramo/palavra-chave (`software`, `restaurante`, `mecânica`…)   |
| `query.city`              | string  | ❌          | cidade/bairro                                                 |
| `query.state`             | string  | ❌          | estado/UF                                                     |
| `webhook.url`             | string  | ✅          | URL que recebe os leads (um POST por lead)                    |
| `webhook.retry`           | boolean | ❌          | `false` = sem retentativas. Padrão `true`                     |
| `webhook.timeout`         | number  | ❌          | timeout por POST ao webhook, em ms (1000–120000)              |
| `options.onlyWithPhone`   | boolean | ❌          | ignora lugares sem telefone. Padrão `false`                   |
| `options.onlyRepeat`      | boolean | ❌          | `false` = sem telefones repetidos (dedupe). Padrão `true`     |
| `options.onlyInfosExtras` | boolean | ❌          | visita o site do lead p/ email/redes. Padrão `false`          |

**Payload recebido no webhook** (um por lead): objeto `{ lead }` — veja o tipo [`LeadPayload`](./src/types.ts).

### Painel `/manager` (exigem `token`)

```ts
const state = await client.getState();                 // Snapshot ao vivo (KPIs, jobs, leads recentes)
const { jobs } = await client.getJobs({ limit: 50 });  // histórico de jobs
const page = await client.getLeads({ limit: 12, offset: 0 }); // { leads, total, limit, offset }
const jobLeads = await client.getJobLeads('job_123', { limit: 50 }); // leads de um job
const xlsx = await client.exportLeadsXlsx();           // Uint8Array (.xlsx)
```

Persistindo o export em Node:

```ts
import { writeFile } from 'node:fs/promises';
await writeFile('leads.xlsx', await client.exportLeadsXlsx());
```

### Stream ao vivo (SSE)

Acompanhe o progresso em tempo real. Duas formas:

```ts
// 1) Callback + função de encerramento
const stop = client.onSnapshot(
  (snap) => console.log('leads:', snap.totals.leads, 'jobs ativos:', snap.totals.activeJobs),
  { onError: (e) => console.error(e) },
);
// ...depois: stop();

// 2) Async iterator (com AbortController para encerrar)
const ac = new AbortController();
for await (const snap of client.streamSnapshots({ signal: ac.signal })) {
  if (snap.totals.activeJobs === 0) ac.abort();
}
```

## Tratamento de erros

Toda falha de HTTP/rede vira uma `MapsToLeadError`:

```ts
import { MapsToLead, MapsToLeadError } from '@jhowbhz/maps-to-lead';

try {
  await client.getState();
} catch (err) {
  if (err instanceof MapsToLeadError) {
    console.error(err.status);          // 401, 429, 500… (0 = rede/timeout)
    console.error(err.message);         // mensagem da API
    console.error(err.body);            // corpo cru da resposta
    if (err.isUnauthorized) { /* token inválido/ausente */ }
    if (err.isRateLimited)  { /* 429 — respeite o rate limit */ }
    if (err.isNetworkError) { /* servidor fora do ar / timeout */ }
  }
}
```

## Cancelamento e timeout

```ts
// timeout por chamada
await client.getLeads({ limit: 100 }, { timeoutMs: 5000 });

// cancelamento manual
const ac = new AbortController();
const p = client.getState({ signal: ac.signal });
ac.abort();
```

## TypeScript

Os tipos do domínio são exportados: `FindRequest`, `FindResponse`, `Lead`, `LeadPayload`, `LeadRecord`, `Job`, `Snapshot`, `Tier`, entre outros.

```ts
import type { LeadPayload, Snapshot } from '@jhowbhz/maps-to-lead';

// ex.: tipando seu handler de webhook (Express)
app.post('/webhook', (req: { body: LeadPayload }, res) => {
  const { lead } = req.body;
  console.log(lead.name, lead.contacts.phone);
  res.sendStatus(200);
});
```

## Exemplos

Veja a pasta [`examples/`](./examples).

## Licença

MIT. Faz parte do projeto [maps-to-lead](https://github.com/jhowbhz/maps-to-lead).
