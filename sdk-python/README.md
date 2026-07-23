# maps-to-lead (Python)

SDK cliente (Python 3) para a API **[Maps to Lead](https://github.com/jhowbhz/maps-to-lead)** — prospecção de leads a partir do Google Maps: nome, telefone, WhatsApp, site, endereço e (opcional) email/redes.

> ⚠️ **Não apoiamos nem incentivamos a prática de SPAM.** Utilize com sabedoria e respeite a LGPD/GDPR e os termos de uso das plataformas.

- **Zero dependências** — usa só a biblioteca padrão (`urllib`).
- **Tipado** (`py.typed`) — dataclasses de entrada e `TypedDict` nas respostas.
- Cobre `POST /api/find` e todo o painel `/manager` (state, jobs, leads, export `.xlsx`, stream ao vivo por SSE).

Este pacote é um **cliente HTTP**: ele fala com um servidor Maps to Lead que você mesmo hospeda (via Docker ou código). Ele **não** faz o scraping localmente. Suba o servidor primeiro — veja o [README do projeto](https://github.com/jhowbhz/maps-to-lead#readme).

## Requisitos

- **Python >= 3.8**
- Uma instância da API Maps to Lead acessível (ex.: `http://localhost:9000`).
- O `MANAGER_TOKEN` do servidor — necessário apenas para os endpoints do painel.

## Instalação

```bash
pip install maps-to-lead
```

## Início rápido

```python
from maps_to_lead import MapsToLead

client = MapsToLead("http://localhost:9000", token="MANAGER_TOKEN")  # token só p/ o painel

# Inicia a busca — responde na hora com o jobId. Os leads chegam no webhook.
job = client.find(
    query={"type": "software", "city": "centro", "state": "rio de janeiro"},
    webhook={"url": "https://webhook.site/seu-id", "retry": False, "timeout": 6000},
    options={"only_with_phone": True, "only_repeat": False, "only_infos_extras": True},
)

print(job["jobId"])  # ex.: "job_1737500000000_1"
```

Prefere entrada tipada? Use as dataclasses:

```python
from maps_to_lead import MapsToLead, FindQuery, FindWebhook, FindOptions

client.find(
    query=FindQuery(type="restaurante", city="savassi", state="MG"),
    webhook=FindWebhook(url="https://meu-endpoint/webhook"),
    options=FindOptions(only_with_phone=True),
)
```

## Configuração do cliente

```python
MapsToLead(
    "https://seu-host:9000",   # base_url (obrigatório)
    token="MANAGER_TOKEN",     # opcional — exigido pelos endpoints /manager
    timeout=30.0,              # opcional — timeout padrão por request, em segundos (None desliga)
    headers={"X-Custom": "1"}, # opcional — headers extras em toda request
    opener=None,               # opcional — urllib OpenerDirector (ex.: proxy)
)
```

## API

As respostas são **dicts JSON crus** (chaves em `camelCase`, como a API envia). Cada método aceita `timeout=` (segundos) por chamada.

### `find(query, webhook, options=None)` — inicia uma busca

Não exige token. Responde na hora; a extração roda em segundo plano e cada lead é entregue via `POST` no seu `webhook["url"]`.

| Campo                     | Tipo    | Obrigatório | Descrição                                                     |
|---------------------------|---------|-------------|---------------------------------------------------------------|
| `query.type`              | str     | ✅          | ramo/palavra-chave (`software`, `restaurante`…)               |
| `query.city` / `state`    | str     | ❌          | localização                                                   |
| `webhook.url`             | str     | ✅          | URL que recebe os leads (um POST por lead)                    |
| `webhook.retry`           | bool    | ❌          | `False` = sem retentativas. Padrão `True`                     |
| `webhook.timeout`         | int     | ❌          | timeout por POST ao webhook, em ms (1000–120000)              |
| `options.only_with_phone` | bool    | ❌          | ignora lugares sem telefone. Padrão `False`                   |
| `options.only_repeat`     | bool    | ❌          | `False` = sem telefones repetidos (dedupe). Padrão `True`     |
| `options.only_infos_extras`| bool   | ❌          | visita o site do lead p/ email/redes. Padrão `False`          |

### Painel `/manager` (exigem `token`)

```python
state    = client.get_state()                       # snapshot ao vivo (KPIs, jobs, leads)
jobs     = client.get_jobs(limit=50)                # {"jobs": [...]}
page     = client.get_leads(limit=12, offset=0)     # {"leads": [...], "total", "limit", "offset"}
job_leads = client.get_job_leads("job_123", limit=50)
xlsx     = client.export_leads_xlsx()               # bytes (.xlsx)

with open("leads.xlsx", "wb") as f:
    f.write(xlsx)
```

### Stream ao vivo (SSE)

```python
# 1) Gerador — encerra com break
for snap in client.stream_snapshots():
    print("leads:", snap["totals"]["leads"], "ativos:", snap["totals"]["activeJobs"])
    if snap["totals"]["activeJobs"] == 0:
        break

# 2) Callback numa thread de fundo + função de parada
stop = client.on_snapshot(
    lambda snap: print(snap["totals"]["leads"]),
    on_error=lambda e: print("erro:", e),
)
# ...depois: stop()
```

## Tratamento de erros

Toda falha de HTTP/rede vira uma `MapsToLeadError`:

```python
from maps_to_lead import MapsToLead, MapsToLeadError

try:
    client.get_state()
except MapsToLeadError as e:
    print(e.status)          # 401, 429, 500… (0 = rede/timeout)
    print(e.body)            # corpo cru da resposta
    if e.is_unauthorized: ...  # token inválido/ausente
    if e.is_rate_limited: ...  # 429 — respeite o rate limit
    if e.is_network_error: ... # servidor fora do ar / timeout
```

## Payload recebido no seu webhook

Cada lead chega como um `POST` com o corpo `{"lead": {...}}`. O tipo é `LeadPayload` (veja `maps_to_lead.models`). Exemplo com Flask:

```python
from flask import Flask, request

app = Flask(__name__)

@app.post("/webhook")
def webhook():
    lead = request.json["lead"]
    print(lead["name"], lead["contacts"]["phone"])
    return "", 200
```

## Exemplos

Veja a pasta [`examples/`](./examples).

## Licença

MIT. faz parte do projeto [maps-to-lead](https://github.com/jhowbhz/maps-to-lead).
