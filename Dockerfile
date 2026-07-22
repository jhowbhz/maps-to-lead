# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — deps: node_modules de PRODUÇÃO (sem devDeps).
# Compila o better-sqlite3 (nativo) aqui, na mesma família (bookworm) do runtime.
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD evita baixar o Chromium no postinstall — o
# navegador é instalado no runtime com --with-deps.
# ---------------------------------------------------------------------------
FROM node:22-bookworm AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 — builder: instala TUDO (com devDeps + workspace web) e gera
# o painel React (Vite -> public/manager) e o backend (tsc -> dist).
# ---------------------------------------------------------------------------
FROM node:22-bookworm AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
# Removemos o package-lock antes do install: um lockfile gerado em outro SO
# (ex.: Windows) não lista as deps opcionais nativas de plataforma do Vite/Rollup
# (@rollup/rollup-linux-x64-gnu) e o npm as pula. Sem o lockfile, o npm resolve
# do zero no linux e instala o binário certo. O node_modules do builder é
# descartado — as deps de runtime vêm do stage `deps` (npm ci determinístico).
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runtime: imagem final enxuta com Chromium + libs de sistema.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/leads.db \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# node_modules de produção (com o binário nativo do better-sqlite3).
COPY --from=deps /app/node_modules ./node_modules

# Chromium + dependências de sistema, casando com a versão do playwright
# instalada nos node_modules. Deixa o browser legível pelo usuário não-root.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-liberation \
    && npx playwright install --with-deps chromium \
    && chmod -R a+rx /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Artefatos buildados.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY package.json ./

# Diretório de dados do SQLite (montado como volume) — gravável pelo usuário node.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data

# Porta configurável (build-arg com default 9000), definida por último para que
# trocar a porta não invalide a camada pesada do Chromium. Em runtime, o app lê
# a env PORT — `docker run -e PORT=...` ou o compose sobrescrevem sem rebuild.
ARG PORT=9000
ENV PORT=${PORT}
USER node
EXPOSE ${PORT}
CMD ["node", "dist/index.js"]
