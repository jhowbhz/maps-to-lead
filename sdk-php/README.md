# jhowbhz/maps-to-lead (PHP)

SDK cliente (PHP 8) para a API **[Maps to Lead](https://github.com/jhowbhz/maps-to-lead)** — prospecção de leads a partir do Google Maps: nome, telefone, WhatsApp, site, endereço e (opcional) email/redes.

> ⚠️ **Não apoiamos nem incentivamos a prática de SPAM.** Utilize com sabedoria e respeite a LGPD/GDPR e os termos de uso das plataformas.

- **Zero dependências** de terceiros — usa a extensão `cURL`.
- **Tipado** — value objects e exceções com PHP 8.
- Cobre `POST /api/find` e todo o painel `/manager` (state, jobs, leads, export `.xlsx`, stream ao vivo por SSE).

Este pacote é um **cliente HTTP**: ele fala com um servidor Maps to Lead que você mesmo hospeda (via Docker ou código). Ele **não** faz o scraping localmente. Suba o servidor primeiro — veja o [README do projeto](https://github.com/jhowbhz/maps-to-lead#readme).

## Requisitos

- **PHP >= 8.1** com as extensões `curl` e `json`.
- Uma instância da API Maps to Lead acessível (ex.: `http://localhost:9000`).
- O `MANAGER_TOKEN` do servidor — necessário apenas para os endpoints do painel.

## Instalação

```bash
composer require jhowbhz/maps-to-lead
```

## Início rápido

```php
<?php
require 'vendor/autoload.php';

use Jhowbhz\MapsToLead\MapsToLead;

$client = new MapsToLead('http://localhost:9000', token: 'MANAGER_TOKEN'); // token só p/ o painel

// Inicia a busca — responde na hora com o jobId. Os leads chegam no webhook.
$job = $client->find(
    query: ['type' => 'software', 'city' => 'centro', 'state' => 'rio de janeiro'],
    webhook: ['url' => 'https://webhook.site/seu-id', 'retry' => false, 'timeout' => 6000],
    options: ['onlyWithPhone' => true, 'onlyRepeat' => false, 'onlyInfosExtras' => true],
);

echo $job['jobId']; // ex.: "job_1737500000000_1"
```

Prefere entrada tipada? Use os value objects:

```php
use Jhowbhz\MapsToLead\{MapsToLead, FindQuery, FindWebhook, FindOptions};

$client->find(
    query: new FindQuery(type: 'restaurante', city: 'savassi', state: 'MG'),
    webhook: new FindWebhook(url: 'https://meu-endpoint/webhook'),
    options: new FindOptions(onlyWithPhone: true),
);
```

## Configuração do cliente

```php
new MapsToLead(
    'https://seu-host:9000', // baseUrl (obrigatório)
    token: 'MANAGER_TOKEN',  // opcional — exigido pelos endpoints /manager
    timeout: 30.0,           // opcional — timeout padrão por request, em segundos (0 desliga)
    headers: ['X-Custom' => '1'], // opcional — headers extras em toda request
);
```

## API

As respostas são **arrays associativos** (JSON decodificado, chaves em `camelCase`, como a API envia). Cada método aceita `timeout:` (segundos) por chamada.

### `find($query, $webhook, $options = null)` — inicia uma busca

Não exige token. Responde na hora; a extração roda em segundo plano e cada lead é entregue via `POST` no seu `webhook['url']`.

| Campo                    | Tipo   | Obrigatório | Descrição                                                     |
|--------------------------|--------|-------------|---------------------------------------------------------------|
| `query.type`             | string | ✅          | ramo/palavra-chave (`software`, `restaurante`…)               |
| `query.city` / `state`   | string | ❌          | localização                                                   |
| `webhook.url`            | string | ✅          | URL que recebe os leads (um POST por lead)                    |
| `webhook.retry`          | bool   | ❌          | `false` = sem retentativas. Padrão `true`                     |
| `webhook.timeout`        | int    | ❌          | timeout por POST ao webhook, em ms (1000–120000)              |
| `options.onlyWithPhone`  | bool   | ❌          | ignora lugares sem telefone. Padrão `false`                   |
| `options.onlyRepeat`     | bool   | ❌          | `false` = sem telefones repetidos (dedupe). Padrão `true`     |
| `options.onlyInfosExtras`| bool   | ❌          | visita o site do lead p/ email/redes. Padrão `false`          |

### Painel `/manager` (exigem `token`)

```php
$state    = $client->getState();                    // snapshot ao vivo (KPIs, jobs, leads)
$jobs     = $client->getJobs(limit: 50);            // ['jobs' => [...]]
$page     = $client->getLeads(limit: 12, offset: 0);// ['leads' => [...], 'total', 'limit', 'offset']
$jobLeads = $client->getJobLeads('job_123', limit: 50);
$xlsx     = $client->exportLeadsXlsx();             // string (bytes do .xlsx)

file_put_contents('leads.xlsx', $xlsx);
```

### Stream ao vivo (SSE)

Método bloqueante. Retorne `false` no callback para encerrar:

```php
$client->stream(function (array $snap): ?bool {
    printf("leads=%d ativos=%d\n", $snap['totals']['leads'], $snap['totals']['activeJobs']);
    return $snap['totals']['activeJobs'] === 0 ? false : null; // false encerra
});
```

## Tratamento de erros

Toda falha de HTTP/rede vira uma `MapsToLeadException`:

```php
use Jhowbhz\MapsToLead\MapsToLeadException;

try {
    $client->getState();
} catch (MapsToLeadException $e) {
    echo $e->status;          // 401, 429, 500… (0 = rede/timeout)
    echo $e->getMessage();    // mensagem da API
    var_dump($e->body);       // corpo já decodificado da resposta
    if ($e->isUnauthorized()) { /* token inválido/ausente */ }
    if ($e->isRateLimited())  { /* 429 — respeite o rate limit */ }
    if ($e->isNetworkError()) { /* servidor fora do ar / timeout */ }
}
```

## Payload recebido no seu webhook

Cada lead chega como um `POST` com o corpo `{"lead": {...}}`. Exemplo (Laravel):

```php
Route::post('/webhook', function (\Illuminate\Http\Request $request) {
    $lead = $request->input('lead');
    logger()->info($lead['name'] . ' ' . $lead['contacts']['phone']);
    return response()->noContent();
});
```

## Exemplos

Veja a pasta [`examples/`](./examples).

## Licença

MIT © Jonathan Henrique. Faz parte do projeto [maps-to-lead](https://github.com/jhowbhz/maps-to-lead).
