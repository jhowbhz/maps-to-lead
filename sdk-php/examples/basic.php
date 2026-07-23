<?php

/**
 * Exemplo básico: inicia uma busca e acompanha o progresso ao vivo.
 *
 *   MANAGER_TOKEN=seu-token php examples/basic.php
 */

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Jhowbhz\MapsToLead\MapsToLead;
use Jhowbhz\MapsToLead\MapsToLeadException;

$client = new MapsToLead(
    getenv('BASE_URL') ?: 'http://localhost:9000',
    token: getenv('MANAGER_TOKEN') ?: null,
);

try {
    $job = $client->find(
        query: ['type' => 'software', 'city' => 'centro', 'state' => 'rio de janeiro'],
        webhook: ['url' => getenv('WEBHOOK_URL') ?: 'https://webhook.site/replace-me'],
        options: ['onlyWithPhone' => true, 'onlyRepeat' => false],
    );
    echo 'Busca iniciada: ' . $job['jobId'] . PHP_EOL;

    // Acompanha o painel ao vivo até o job terminar.
    $client->stream(function (array $snap): ?bool {
        $t = $snap['totals'];
        printf("leads=%d enviados=%d jobs_ativos=%d\n", $t['leads'], $t['sent'], $t['activeJobs']);

        return $t['activeJobs'] === 0 ? false : null; // false encerra o stream
    });

    echo 'Concluído.' . PHP_EOL;
} catch (MapsToLeadException $e) {
    fwrite(STDERR, sprintf("Erro HTTP %d: %s\n", $e->status, $e->getMessage()));
    exit(1);
}
