"""Leitor mínimo de Server-Sent Events (SSE).

Só entende o que a rota ``/manager/stream`` envia: linhas ``data: <json>`` e
comentários de keep-alive (``: ping``). Itera sobre um objeto de resposta
file-like (``http.client.HTTPResponse``), linha a linha.
"""

from __future__ import annotations

from typing import Iterable, Iterator


def iter_sse(response: Iterable[bytes]) -> Iterator[str]:
    """Consome bytes de um stream SSE e produz cada bloco ``data:`` como string.

    Junta linhas ``data:`` consecutivas do mesmo evento e ignora comentários.
    """
    data_lines: list[str] = []
    for raw_line in response:
        line = raw_line.decode("utf-8", "replace").rstrip("\n").rstrip("\r")
        if line == "":
            # Linha em branco = fim do evento.
            if data_lines:
                yield "\n".join(data_lines)
                data_lines = []
            continue
        if line.startswith(":"):
            continue  # comentário / keep-alive
        if line.startswith("data:"):
            value = line[5:]
            if value.startswith(" "):
                value = value[1:]
            data_lines.append(value)
    if data_lines:
        yield "\n".join(data_lines)
