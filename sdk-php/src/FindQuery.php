<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

/** Ramo/palavra-chave + localização que viram a busca do Google Maps. */
final class FindQuery
{
    public function __construct(
        /** Ramo/palavra-chave (ex.: `software`, `restaurante`). Obrigatório. */
        public readonly string $type,
        public readonly string $city = '',
        public readonly string $state = '',
    ) {
    }

    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): self
    {
        return new self(
            type: (string) ($data['type'] ?? ''),
            city: (string) ($data['city'] ?? ''),
            state: (string) ($data['state'] ?? ''),
        );
    }
}
