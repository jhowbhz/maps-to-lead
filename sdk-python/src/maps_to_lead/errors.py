"""Erros do SDK.

Toda falha de rede/HTTP vira uma :class:`MapsToLeadError`, permitindo
``except MapsToLeadError as e: ...``.
"""

from __future__ import annotations

from typing import Any, Optional


class MapsToLeadError(Exception):
    """Erro levantado por qualquer chamada do cliente Maps to Lead."""

    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        url: Optional[str] = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        #: Código HTTP (``0`` = falha de rede/timeout, sem resposta).
        self.status = status
        #: URL que falhou (quando aplicável).
        self.url = url
        #: Corpo da resposta já parseado (JSON) ou texto cru.
        self.body = body

    @property
    def is_unauthorized(self) -> bool:
        """Erro de autenticação (401) — token ausente/errado."""
        return self.status == 401

    @property
    def is_rate_limited(self) -> bool:
        """O servidor respondeu 429 (rate limit)."""
        return self.status == 429

    @property
    def is_network_error(self) -> bool:
        """Falha de rede/timeout (sem resposta HTTP)."""
        return self.status == 0

    def __str__(self) -> str:  # pragma: no cover - trivial
        base = super().__str__()
        return f"[HTTP {self.status}] {base}" if self.status else base
