<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead;

/**
 * Parser mínimo de Server-Sent Events (SSE).
 *
 * Só entende o que a rota `/manager/stream` envia: linhas `data: <json>` e
 * comentários de keep-alive (`: ping`). Trabalha de forma incremental sobre um
 * buffer de bytes recebidos.
 *
 * @internal
 */
final class Sse
{
    /**
     * Extrai o primeiro evento completo do buffer.
     *
     * @return array{0: ?string, 1: string}|null `[data, resto]` do primeiro
     *     evento (data é null se o evento só tinha comentário), ou null se
     *     ainda não há um evento completo no buffer.
     */
    public static function extractEvent(string $buffer): ?array
    {
        $lf = strpos($buffer, "\n\n");
        $crlf = strpos($buffer, "\r\n\r\n");

        if ($lf === false && $crlf === false) {
            return null;
        }

        if ($crlf === false || ($lf !== false && $lf < $crlf)) {
            $pos = $lf;
            $sepLen = 2;
        } else {
            $pos = $crlf;
            $sepLen = 4;
        }

        $rawEvent = substr($buffer, 0, (int) $pos);
        $rest = substr($buffer, (int) $pos + $sepLen);

        return [self::parseData($rawEvent), $rest];
    }

    /** Junta as linhas `data:` do evento; ignora comentários (`: ping`). */
    private static function parseData(string $rawEvent): ?string
    {
        $lines = preg_split('/\r?\n/', $rawEvent) ?: [];
        $data = [];

        foreach ($lines as $line) {
            if ($line === '' || $line[0] === ':') {
                continue; // comentário / keep-alive
            }
            if (str_starts_with($line, 'data:')) {
                $value = substr($line, 5);
                if (isset($value[0]) && $value[0] === ' ') {
                    $value = substr($value, 1);
                }
                $data[] = $value;
            }
        }

        return $data === [] ? null : implode("\n", $data);
    }
}
