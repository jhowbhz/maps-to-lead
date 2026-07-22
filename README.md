# 📍 Maps to Lead

API open source de prospecção de leads a partir do Google Maps: extrai nome, telefone,
WhatsApp, site e endereço estruturado por palavra-chave e dispara os resultados em um
webhook. **Não apoiamos nem incentivamos a prática de SPAM** — utilize com sabedoria.

> **v2** — reescrito em **TypeScript**, com scraping via **Playwright**, arquitetura
> modular em camadas, persistência em **SQLite** e um painel de monitoramento ao vivo.

## Arquitetura

```
src/
  config/     # env validada (zod) + logger (pino)
  domain/     # tipos + score do lead (puro)
  parsing/    # normalização de telefone/endereço BR (puro)
  scraper/    # Playwright: browser, semáforo, páginas (feed/detalhe), orquestrador
  webhook/    # cliente de webhook (fetch + timeout + retry)
  jobs/       # store reativo em memória + repositório SQLite
  api/        # Express: middlewares, rotas (/api/find, /manager), servidor
  index.ts    # composition root + graceful shutdown
public/
  manager.html  # dashboard ao vivo (SSE)
tests/          # testes das funções puras (vitest)
```

O scraping roda em **duas fases**: a Fase 1 (síncrona) rola o feed, conta os lugares e
retorna o total na resposta HTTP; a Fase 2 (assíncrona) extrai cada lugar em um pool
paralelo e dispara os webhooks **na ordem original**.

## Requisitos

- Node.js **>= 18.18**
- No Linux, dependências de sistema do Chromium (o Playwright instala com o comando abaixo).

## Instalação

```bash
git clone https://github.com/jhowbhz/maps-to-lead.git maps-to-leads
cd maps-to-leads
cp .env_example .env          # edite o MANAGER_TOKEN
npm install                   # instala deps e o Chromium do Playwright (postinstall)
# No Linux, para instalar libs do sistema do Chromium:
npx playwright install --with-deps chromium
```

## Rodando

```bash
npm run dev        # desenvolvimento (tsx watch, hot-reload)

npm run build      # compila TS -> dist/
npm start          # produção (node dist/index.js)

npm run typecheck  # checagem de tipos
npm test           # testes das funções puras
```

Em background com PM2 (após `npm run build`):

```bash
npm install -g pm2
pm2 start dist/index.js --name "API - MAPS TO LEADS"
```

## API

### `POST /api/find`

| campo           | tipo    | obrigatório | descrição                                             |
|-----------------|---------|-------------|-------------------------------------------------------|
| `query`         | string  | ✅          | palavra-chave da busca (ex: `"Barbearia, Contagem"`)  |
| `webhook`       | string  | ✅          | URL que receberá os leads (um POST por lead)          |
| `qt`            | number  | ❌          | quantos lugares buscar (padrão `20`, máx `1000`)      |
| `onlyWithPhone` | boolean | ❌          | ignora lugares sem telefone (padrão `false`)          |
| `time`, `hook`  | any     | ❌          | aceitos por compatibilidade, não utilizados           |

```bash
curl --location --request POST 'http://127.0.0.1:9000/api/find' \
--header 'Content-Type: application/json' \
--data-raw '{
    "query": "Barbearia Cabral, Contagem",
    "webhook": "https://webhook.site/<seu-id>",
    "qt": 20,
    "onlyWithPhone": true
}'
```

**Resposta `200`** (o `total` já vem da Fase 1; os leads chegam ao webhook em seguida):

```json
{
  "error": false,
  "message": "Encontramos 20 lugares. Você receberá os dados em seu webhook em até 5 minutos.",
  "query": "Barbearia Cabral, Contagem",
  "requested": 20,
  "total": 20,
  "jobId": "job_1737500000000_1",
  "onlyWithPhone": true,
  "webhook": "https://webhook.site/<seu-id>"
}
```

**Payload enviado ao webhook** (um por lead), com o endereço já estruturado:

```json
{
  "lead": {
    "name": "Barbearia Alamedas",
    "rating": "4.7",
    "pic": "https://lh5.googleusercontent.com/p/...",
    "address": {
      "street": "Alameda dos Flamingos",
      "number": "213",
      "neighborhood": "Cabral",
      "city": "Contagem",
      "uf": "MG",
      "cep": "32146-036",
      "full": "Alameda dos Flamingos, 213 - Cabral, Contagem - MG, 32146-036"
    },
    "phone": "+5531988989591",
    "whatsapp": "+5531988989591",
    "website": "https://barbeariaalamedas.negocio.site"
  },
  "infos": [
    "Alameda dos Flamingos, 213 - Cabral, Contagem - MG, 32146-036",
    "+5531988989591",
    "https://barbeariaalamedas.negocio.site"
  ]
}
```

## Painel de monitoramento — `/manager`

Dashboard ao vivo (SSE) com jobs, progresso, % com telefone/WhatsApp, score dos leads
(0–100, tiers A/B/C/D), latência e feed de leads recentes. Login por **token**
(`MANAGER_TOKEN` no `.env`).

- `GET /manager` — painel
- `GET /manager/api/state` — snapshot JSON (token)
- `GET /manager/stream` — stream SSE ao vivo (token)
- `GET /manager/api/jobs` — histórico de jobs persistidos (token)
- `GET /manager/api/jobs/:id/leads` — leads de um job, paginado (token)

Acesse `http://SEU_HOST:9000/manager` e informe o token (ou use `?token=...`).

## Persistência

Jobs e leads são gravados em **SQLite** (`DB_PATH`, padrão `./data/leads.db`) — o
histórico sobrevive a reinícios e é re-hidratado no boot. O estado ao vivo do painel
continua em memória para respostas instantâneas.

## Configuração

Todas as variáveis (com padrões) estão documentadas em [`.env_example`](.env_example):
paralelismo (`PARSE_CONCURRENCY`, `MAX_CONCURRENCY`), browser (`HEADLESS`,
`BLOCK_RESOURCES`, timeouts), webhook (`WEBHOOK_TIMEOUT_MS`, `WEBHOOK_RETRIES`) e
seletores (`LISTING`, `SCROLL`).

## Nginx (reverse proxy)

```nginx
upstream mapslead { server 127.0.0.1:9000; keepalive 8; }
server {
    server_name SEU_DOMINIO;
    location / {
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header Host $http_host;
      proxy_http_version 1.1;
      proxy_set_header Connection '';   # importante para o SSE do /manager
      proxy_buffering off;              # importante para o SSE do /manager
      proxy_pass http://mapslead/;
      proxy_redirect off;
    }
    listen 80;
}
```

```bash
ln -s /etc/nginx/sites-available/mapslead /etc/nginx/sites-enabled/mapslead
certbot --nginx   # SSL
```

## Screen
<img width="1911" height="904" alt="image" src="https://github.com/user-attachments/assets/13d69c79-12be-4294-8591-8563b4c555f3" />


## Licença

MIT.
