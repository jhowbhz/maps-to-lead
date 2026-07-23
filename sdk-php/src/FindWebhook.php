<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

/** Destino e política de entrega dos leads. */
final class FindWebhook
{
    public function __construct(
        /** URL que receberá os leads (um POST por lead). Obrigatório. */
        public readonly string $url,
        /** `false` = sem retentativas. Padrão do servidor: `true`. */
        public readonly bool $retry = true,
        /** Timeout por POST ao webhook, em ms (1000–120000). */
        public readonly ?int $timeout = null,
    ) {
    }

    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): self
    {
        $timeout = $data['timeout'] ?? null;

        return new self(
            url: (string) ($data['url'] ?? ''),
            retry: (bool) ($data['retry'] ?? true),
            timeout: $timeout !== null ? (int) $timeout : null,
        );
    }
}
