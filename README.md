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
web/            # painel React (Vite + TS) — código-fonte do dashboard
public/manager/ # painel buildado, servido pelo Express (gerado por `build:web`)
tests/          # testes das funções puras (vitest)
```

O painel `/manager` é uma **SPA React** (workspace `web/`, Vite + TypeScript). Em
produção o Express serve o build de `public/manager/`; em dev, o Vite roda com HMR e
faz proxy da API/SSE para o backend.

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
npm run dev        # API (tsx watch) + painel React (Vite/HMR) juntos
                   #   painel em dev: http://localhost:5173/manager/

npm run build      # builda o painel React (public/manager/) + compila o TS (dist/)
npm start          # produção (node dist/index.js) — serve API + painel

npm run typecheck  # checagem de tipos do backend
npm test           # testes das funções puras

# só o painel:
npm run dev:web    # Vite dev server isolado
npm run build:web  # build do painel -> public/manager/
```

Em background com PM2 (após `npm run build`):

```bash
npm install -g pm2
pm2 start dist/index.js --name "API - MAPS TO LEADS"
```

## Docker

Imagem multi-stage que já inclui o **Chromium do Playwright** (com as libs de
sistema) e builda o **painel React**. O SQLite é persistido em um volume.

Pré-requisito: crie o `.env` com o `MANAGER_TOKEN` (o compose lê dele).

```bash
cp .env_example .env          # defina MANAGER_TOKEN
docker compose up -d --build
```

- Painel: `http://localhost:9000/manager`
- Os dados (SQLite) persistem no volume `leads-data` — sobrevivem a `down`/`up`.

Sem compose:

```bash
docker build -t maps-to-lead .
docker run -d --name maps-to-lead -p 9000:9000 \
  -e MANAGER_TOKEN=seu-token \
  -v maps-to-lead-data:/app/data \
  --init --shm-size=1g \
  maps-to-lead
```

Notas:
- Dentro do container o app ouve em `HOST=0.0.0.0` (já definido na imagem/compose).
- O Chromium já vem instalado — **não** é preciso rodar `playwright install`.
- Tunáveis (`PARSE_CONCURRENCY`, `MAX_CONCURRENCY`, `BLOCK_RESOURCES`, …) via variáveis de ambiente.

## API

### `POST /api/find`

Traz **tudo** que encontrar na região (sem limite de quantidade) e responde
**na hora** com o `jobId` — a extração roda em segundo plano. Acompanhe em `/manager`.

O body é estruturado em três objetos:

| campo                    | tipo    | obrigatório | descrição                                                            |
|--------------------------|---------|-------------|----------------------------------------------------------------------|
| `query.type`             | string  | ✅          | ramo/palavra-chave (ex.: `software`, `restaurante`, `mecânica`)      |
| `query.city`             | string  | ❌          | cidade/bairro                                                        |
| `query.state`            | string  | ❌          | estado                                                               |
| `webhook.url`            | string  | ✅          | URL que receberá os leads (um POST por lead)                         |
| `webhook.retry`          | boolean | ❌          | `false` = sem retentativas. Padrão `true`                            |
| `webhook.timeout`        | number  | ❌          | timeout por POST, em ms (1000–120000)                                |
| `options.onlyWithPhone`  | boolean | ❌          | ignora lugares sem telefone (padrão `false`)                         |
| `options.onlyRepeat`     | boolean | ❌          | `false` = **não** envia telefones repetidos (dedupe). Padrão `true`  |
| `options.onlyInfosExtras`| boolean | ❌          | `true` = visita o site do lead (pool paralelo) e extrai email/redes. Padrão `false` |

A busca do Maps é montada de `type, city, state` (ex.: `"software, centro, rio de janeiro"`).

```bash
curl --location --request POST 'http://127.0.0.1:9000/api/find' \
--header 'Content-Type: application/json' \
--data-raw '{
    "query":   { "type": "software", "city": "centro", "state": "rio de janeiro" },
    "webhook": { "url": "https://webhook.site/<seu-id>", "retry": false, "timeout": 6000 },
    "options": { "onlyWithPhone": true, "onlyRepeat": false, "onlyInfosExtras": true }
}'
```

**Resposta `200`** (instantânea — a busca roda em background; sem contagem no retorno):

```json
{
  "error": false,
  "message": "A busca foi iniciada. Você receberá os resultados no seu webhook em até 5 minutos.",
  "jobId": "job_1737500000000_1",
  "query": { "type": "software", "city": "centro", "state": "rio de janeiro" },
  "options": { "onlyWithPhone": true, "onlyRepeat": false },
  "webhook": "https://webhook.site/<seu-id>"
}
```

**Payload enviado ao webhook** (um por lead):

```json
{
  "lead": {
    "name": "Group Software",
    "pic": "https://ssl.gstatic.com/local/servicebusiness/default_user.png",
    "rating": { "note": "4.6", "quantity": 403 },
    "address": {
      "street": "R. Santa Catarina",
      "number": "1631",
      "neighborhood": "Lourdes",
      "city": "Belo Horizonte",
      "uf": "MG",
      "cep": "30170-081",
      "full": "R. Santa Catarina, 1631 - Lourdes, Belo Horizonte - MG, 30170-081"
    },
    "contacts": {
      "phone": "+558007025700",
      "whatsapp": "",
      "ddd": "80",
      "email": ""
    },
    "social": {
      "instagram": "https://www.instagram.com/groupsoftware/",
      "facebook": "https://www.facebook.com/groupsoftware",
      "site": "https://www.groupsoftware.com.br/"
    },
    "extra": {
      "site_visitado": true,
      "campos_encontrados": ["instagram", "facebook"],
      "email": "",
      "instagram": "https://www.instagram.com/groupsoftware/",
      "facebook": "https://www.facebook.com/groupsoftware"
    }
  }
}
```

- `ddd` é derivado do telefone; números **não geográficos** (0800/0300…) ficam com `ddd: ""`.
  Se o **link do Maps** já for um Instagram/Facebook, é roteado automaticamente para `social.*`.
- `extra` só é preenchido com `options.onlyInfosExtras: true` — o site do lead é visitado num
  **pool paralelo**; se a home não tiver email, ele segue as páginas de **contato**.
  `campos_encontrados` lista o que achou (email/instagram/facebook).

## Painel de monitoramento — `/manager`

SPA **React** ao vivo (SSE) com KPIs, abas **Processos** e **Leads** (ambas em tabela,
paginadas de 12 em 12), progresso, % com telefone/WhatsApp, score dos leads (0–100,
tiers A/B/C/D), latência e **download dos leads em `.xlsx`**. Login por **token**
(`MANAGER_TOKEN` no `.env`).

- `GET /manager` — painel (SPA React)
- `GET /manager/api/state` — snapshot JSON (token)
- `GET /manager/stream` — stream SSE ao vivo (token)
- `GET /manager/api/leads` — leads persistidos, paginado (token)
- `GET /manager/api/leads.xlsx` — exporta os leads em planilha (token)
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
<img width="1055" height="737" alt="image" src="https://github.com/user-attachments/assets/b16d90b3-d573-4ccf-b3ef-87bf2a7305ee" />

## Licença

MIT.
