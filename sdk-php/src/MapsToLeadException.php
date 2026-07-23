<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

use RuntimeException;
use Throwable;

/**
 * Erro levantado por qualquer chamada do cliente Maps to Lead.
 *
 * `status` é 0 para falhas de rede/timeout (sem resposta HTTP).
 */
final class MapsToLeadException extends RuntimeException
{
    /** @param mixed $body Corpo da resposta já decodificado (array) ou texto cru. */
    public function __construct(
        string $message,
        public readonly int $status = 0,
        public readonly ?string $url = null,
        public readonly mixed $body = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    /** Erro de autenticação (401) — token ausente/errado. */
    public function isUnauthorized(): bool
    {
        return $this->status === 401;
    }

    /** O servidor respondeu 429 (rate limit). */
    public function isRateLimited(): bool
    {
        return $this->status === 429;
    }

    /** Falha de rede/timeout (sem resposta HTTP). */
    public function isNetworkError(): bool
    {
        return $this->status === 0;
    }
}
