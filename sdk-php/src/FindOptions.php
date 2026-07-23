<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

/** Opções de filtragem/enriquecimento da busca. */
final class FindOptions
{
    public function __construct(
        /** Ignora lugares sem telefone. */
        public readonly bool $onlyWithPhone = false,
        /** `false` = não envia telefones repetidos (dedupe). */
        public readonly bool $onlyRepeat = true,
        /** `true` = visita o site do lead e extrai email/redes. */
        public readonly bool $onlyInfosExtras = false,
    ) {
    }

    /**
     * Aceita chaves em camelCase (como a API) ou snake_case.
     *
     * @param array<string,mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $pick = static function (array $data, array $keys, bool $default): bool {
            foreach ($keys as $key) {
                if (array_key_exists($key, $data)) {
                    return (bool) $data[$key];
                }
            }

            return $default;
        };

        return new self(
            onlyWithPhone: $pick($data, ['onlyWithPhone', 'only_with_phone'], false),
            onlyRepeat: $pick($data, ['onlyRepeat', 'only_repeat'], true),
            onlyInfosExtras: $pick($data, ['onlyInfosExtras', 'only_infos_extras'], false),
        );
    }
}
