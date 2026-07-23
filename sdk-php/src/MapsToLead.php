<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

use JsonException;

/**
 * Cliente HTTP da API Maps to Lead.
 *
 * Sem dependências de terceiros — usa a extensão cURL. Instancie uma vez e
 * reutilize:
 *
 *     use Jhowbhz\MapsToLead\MapsToLead;
 *
 *     $client = new MapsToLead('http://localhost:9000', token: 'MANAGER_TOKEN');
 *     $job = $client->find(
 *         query: ['type' => 'software', 'city' => 'centro', 'state' => 'rio de janeiro'],
 *         webhook: ['url' => 'https://webhook.site/seu-id'],
 *         options: ['onlyWithPhone' => true],
 *     );
 *     echo $job['jobId'];
 *
 * As respostas são arrays associativos (JSON decodificado, chaves em camelCase).
 */
final class MapsToLead
{
    private string $baseUrl;
    private ?string $token;
    private float $timeout;
    /** @var array<string,string> */
    private array $headers;

    /**
     * @param string               $baseUrl URL base do servidor (ex.: `https://seu-host:9000`).
     * @param string|null          $token   MANAGER_TOKEN — exigido pelos endpoints do painel.
     * @param float                $timeout Timeout padrão por requisição, em segundos (0 desliga).
     * @param array<string,string> $headers Headers extras enviados em toda requisição.
     */
    public function __construct(
        string $baseUrl,
        ?string $token = null,
        float $timeout = 30.0,
        array $headers = [],
    ) {
        $baseUrl = trim($baseUrl);
        if ($baseUrl === '') {
            throw new MapsToLeadException('`baseUrl` é obrigatório ao criar o cliente MapsToLead.');
        }
        $this->baseUrl = rtrim($baseUrl, '/');
        $token = $token !== null ? trim($token) : '';
        $this->token = $token !== '' ? $token : null;
        $this->timeout = $timeout;
        $this->headers = $headers;
    }

    // --- Busca --------------------------------------------------------------

    /**
     * Inicia uma busca (`POST /api/find`). Responde na hora com o `jobId` — a
     * extração roda em segundo plano e os leads chegam no `webhook.url`.
     * Não exige token.
     *
     * @param FindQuery|array<string,mixed>        $query
     * @param FindWebhook|array<string,mixed>      $webhook
     * @param FindOptions|array<string,mixed>|null $options
     *
     * @return array<string,mixed>
     */
    public function find(
        FindQuery|array $query,
        FindWebhook|array $webhook,
        FindOptions|array|null $options = null,
        ?float $timeout = null,
    ): array {
        $q = $query instanceof FindQuery ? $query : FindQuery::fromArray($query);
        $w = $webhook instanceof FindWebhook ? $webhook : FindWebhook::fromArray($webhook);
        $o = $options instanceof FindOptions ? $options : FindOptions::fromArray($options ?? []);

        if (trim($q->type) === '') {
            throw new MapsToLeadException('`query.type` é obrigatório em find().');
        }
        if (trim($w->url) === '') {
            throw new MapsToLeadException('`webhook.url` é obrigatório em find().');
        }

        $payload = [
            'query' => ['type' => $q->type, 'city' => $q->city, 'state' => $q->state],
            'webhook' => ['url' => $w->url, 'retry' => $w->retry],
            'options' => [
                'onlyWithPhone' => $o->onlyWithPhone,
                'onlyRepeat' => $o->onlyRepeat,
                'onlyInfosExtras' => $o->onlyInfosExtras,
            ],
        ];
        if ($w->timeout !== null) {
            $payload['webhook']['timeout'] = $w->timeout;
        }

        return $this->requestJson('POST', '/api/find', jsonBody: $payload, timeout: $timeout);
    }

    // --- Painel / histórico (exigem token) ----------------------------------

    /**
     * Snapshot ao vivo do painel (`GET /manager/api/state`).
     *
     * @return array<string,mixed>
     */
    public function getState(?float $timeout = null): array
    {
        return $this->requestJson('GET', '/manager/api/state', auth: true, timeout: $timeout);
    }

    /**
     * Histórico de jobs persistidos (`GET /manager/api/jobs`).
     *
     * @return array<string,mixed>
     */
    public function getJobs(?int $limit = null, ?float $timeout = null): array
    {
        return $this->requestJson(
            'GET',
            '/manager/api/jobs',
            params: ['limit' => $limit],
            auth: true,
            timeout: $timeout,
        );
    }

    /**
     * Todos os leads persistidos, paginado (`GET /manager/api/leads`).
     *
     * @return array<string,mixed>
     */
    public function getLeads(?int $limit = null, ?int $offset = null, ?float $timeout = null): array
    {
        return $this->requestJson(
            'GET',
            '/manager/api/leads',
            params: ['limit' => $limit, 'offset' => $offset],
            auth: true,
            timeout: $timeout,
        );
    }

    /**
     * Leads de um job, paginado (`GET /manager/api/jobs/:id/leads`).
     *
     * @return array<string,mixed>
     */
    public function getJobLeads(
        string $jobId,
        ?int $limit = null,
        ?int $offset = null,
        ?float $timeout = null,
    ): array {
        if (trim($jobId) === '') {
            throw new MapsToLeadException('`jobId` é obrigatório em getJobLeads().');
        }
        $path = '/manager/api/jobs/' . rawurlencode($jobId) . '/leads';

        return $this->requestJson(
            'GET',
            $path,
            params: ['limit' => $limit, 'offset' => $offset],
            auth: true,
            timeout: $timeout,
        );
    }

    /**
     * Exporta todos os leads persistidos como planilha `.xlsx`
     * (`GET /manager/api/leads.xlsx`). Retorna os bytes do arquivo.
     */
    public function exportLeadsXlsx(?float $timeout = null): string
    {
        return $this->send(
            'GET',
            '/manager/api/leads.xlsx',
            auth: true,
            accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            timeout: $timeout,
        );
    }

    // --- Stream ao vivo (SSE) -----------------------------------------------

    /**
     * Assina o stream ao vivo do painel (`GET /manager/stream`) e chama
     * `$onSnapshot` a cada snapshot recebido. Retornar `false` no callback
     * encerra a assinatura. Método bloqueante (roda até o fim ou até parar).
     *
     *     $client->stream(function (array $snap): ?bool {
     *         echo $snap['totals']['leads'], PHP_EOL;
     *         return $snap['totals']['activeJobs'] === 0 ? false : null;
     *     });
     *
     * @param callable(array<string,mixed>): (bool|null) $onSnapshot
     */
    public function stream(callable $onSnapshot): void
    {
        $url = $this->buildUrl('/manager/stream');
        $headers = $this->buildHeaders('text/event-stream', auth: true);

        $buffer = '';
        $stopped = false;
        $errored = false;
        $errorBody = '';

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 0, // stream de longa duração: sem timeout total
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (
                &$buffer,
                &$stopped,
                &$errored,
                &$errorBody,
                $onSnapshot
            ): int {
                if ($stopped) {
                    return -1;
                }
                $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                if ($code >= 400) {
                    $errored = true;
                    $errorBody .= $chunk;

                    return strlen($chunk);
                }
                $buffer .= $chunk;
                while (($event = Sse::extractEvent($buffer)) !== null) {
                    [$data, $buffer] = $event;
                    if ($data === null) {
                        continue;
                    }
                    $snapshot = json_decode($data, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        continue;
                    }
                    if ($onSnapshot($snapshot) === false) {
                        $stopped = true;

                        return -1;
                    }
                }

                return strlen($chunk);
            },
        ]);

        $ok = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($errored) {
            throw $this->errorFromResponse($status, $errorBody, $url);
        }
        if ($ok === false && ! $stopped) {
            // 23 (WRITE_ERROR) e 42 (ABORTED_BY_CALLBACK) só ocorrem quando NÓS abortamos.
            if ($errno === CURLE_OPERATION_TIMEDOUT) {
                throw new MapsToLeadException('Stream expirado (timeout).', 0, $url);
            }
            if ($errno !== 23 && $errno !== 42) {
                throw new MapsToLeadException(
                    'Falha ao ler o stream de eventos: ' . $error,
                    0,
                    $url,
                );
            }
        }
    }

    // --- Internos -----------------------------------------------------------

    /**
     * @param array<string,mixed> $params
     * @param mixed               $jsonBody
     *
     * @return array<string,mixed>
     */
    private function requestJson(
        string $method,
        string $path,
        array $params = [],
        mixed $jsonBody = null,
        bool $auth = false,
        ?float $timeout = null,
    ): array {
        $body = $this->send($method, $path, $params, $jsonBody, $auth, 'application/json', $timeout);
        if ($body === '') {
            return [];
        }
        try {
            $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new MapsToLeadException(
                'Resposta da API não é JSON válido.',
                0,
                $this->buildUrl($path, $params),
                $body,
                $e,
            );
        }

        return is_array($decoded) ? $decoded : ['value' => $decoded];
    }

    /**
     * @param array<string,mixed> $params
     * @param mixed               $jsonBody
     */
    private function send(
        string $method,
        string $path,
        array $params = [],
        mixed $jsonBody = null,
        bool $auth = false,
        string $accept = 'application/json',
        ?float $timeout = null,
    ): string {
        $url = $this->buildUrl($path, $params);
        $headers = $this->buildHeaders($accept, $auth);

        $ch = curl_init();
        $opts = [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
        ];
        if ($jsonBody !== null) {
            $payload = json_encode($jsonBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $opts[CURLOPT_POSTFIELDS] = $payload === false ? '' : $payload;
            $headers[] = 'Content-Type: application/json';
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;

        $effective = $timeout ?? $this->timeout;
        if ($effective > 0) {
            $opts[CURLOPT_TIMEOUT_MS] = (int) round($effective * 1000);
        }
        curl_setopt_array($ch, $opts);

        $body = curl_exec($ch);
        if ($body === false) {
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            curl_close($ch);
            $isTimeout = $errno === CURLE_OPERATION_TIMEDOUT;
            throw new MapsToLeadException(
                $isTimeout
                    ? 'Requisição expirada (timeout).'
                    : 'Falha de rede ao contatar a API Maps to Lead: ' . $error,
                0,
                $url,
            );
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($status >= 400) {
            throw $this->errorFromResponse($status, (string) $body, $url);
        }

        return (string) $body;
    }

    private function errorFromResponse(int $status, string $body, string $url): MapsToLeadException
    {
        $parsed = null;
        if ($body !== '') {
            try {
                $parsed = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                $parsed = $body;
            }
        }
        $message = is_array($parsed) && isset($parsed['message']) && is_string($parsed['message'])
            ? $parsed['message']
            : "Requisição falhou com HTTP {$status}.";

        return new MapsToLeadException($message, $status, $url, $parsed);
    }

    /**
     * @param array<string,mixed> $params
     */
    private function buildUrl(string $path, array $params = []): string
    {
        $url = $this->baseUrl . $path;
        $filtered = array_filter($params, static fn ($v) => $v !== null);
        if ($filtered !== []) {
            $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($filtered);
        }

        return $url;
    }

    /**
     * @return list<string>
     */
    private function buildHeaders(string $accept, bool $auth): array
    {
        $headers = [];
        foreach ($this->headers as $name => $value) {
            $headers[] = $name . ': ' . $value;
        }
        $headers[] = 'Accept: ' . $accept;
        if ($auth) {
            $headers[] = 'Authorization: Bearer ' . $this->requireToken();
        }

        return $headers;
    }

    private function requireToken(): string
    {
        if ($this->token === null) {
            throw new MapsToLeadException(
                'Este endpoint requer o MANAGER_TOKEN. '
                . 'Passe `token:` ao criar o cliente MapsToLead.',
            );
        }

        return $this->token;
    }
}
