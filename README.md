# 📍 Maps to Lead

API open source de prospecção de leads a partir do Google Maps: extrai nome, telefone,
WhatsApp, site e endereço estruturado por palavra-chave e dispara os resultados em um
webhook. **Não apoiamos nem incentivamos a prática de SPAM** — utilize com sabedoria.

A resposta é **instantânea**: `POST /api/find` inicia a busca e retorna na hora com o
`jobId`. A extração roda em segundo plano — rola o feed inteiro, extrai cada lugar num pool
paralelo, (opcional) enriquece pelo site do lead e dispara os webhooks **na ordem original**.

## Rodando

```bash
docker run -d --name maps-to-lead -p 9000:9000 \
  -e MANAGER_TOKEN=seu-token \
  -v maps-to-lead-data:/app/data \
  --init --shm-size=1g \
  ghcr.io/jhowbhz/maps-to-lead:latest
```

### Com docker compose (a partir do fonte)

```bash
cp .env_example .env          # defina MANAGER_TOKEN
docker compose up -d --build
```

- Painel: `http://localhost:9000/manager`

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
      "ddd": "",
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

## Screen
<img width="1055" height="737" alt="image" src="https://github.com/user-attachments/assets/b16d90b3-d573-4ccf-b3ef-87bf2a7305ee" />

## Licença

MIT.
