"""Modelos do SDK.

- **Entrada**: dataclasses ergonômicas em ``snake_case`` (:class:`FindQuery`,
  :class:`FindWebhook`, :class:`FindOptions`). Os métodos também aceitam dicts.
- **Saída**: as respostas são dicts JSON crus (chaves em ``camelCase``, como a
  API envia). Os ``TypedDict`` abaixo servem só para *type hints*.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

try:  # TypedDict/Literal existem no typing a partir do 3.8
    from typing import Literal, TypedDict
except ImportError:  # pragma: no cover
    from typing_extensions import Literal, TypedDict  # type: ignore


# --- Entrada (POST /api/find) ----------------------------------------------


@dataclass
class FindQuery:
    """Ramo/palavra-chave + localização que viram a busca do Google Maps."""

    type: str
    city: str = ""
    state: str = ""


@dataclass
class FindWebhook:
    """Destino e política de entrega dos leads."""

    url: str
    #: ``False`` = sem retentativas. Padrão do servidor: ``True``.
    retry: bool = True
    #: Timeout por POST ao webhook, em ms (1000–120000).
    timeout: Optional[int] = None


@dataclass
class FindOptions:
    """Opções de filtragem/enriquecimento da busca."""

    #: Ignora lugares sem telefone.
    only_with_phone: bool = False
    #: ``False`` = não envia telefones repetidos (dedupe).
    only_repeat: bool = True
    #: ``True`` = visita o site do lead e extrai email/redes.
    only_infos_extras: bool = False


# --- Saída (type hints; em runtime são dicts) -------------------------------

Tier = Literal["A", "B", "C", "D"]
JobStatus = Literal["scraping", "parsing", "done", "error"]


class FindResponse(TypedDict):
    error: bool
    message: str
    jobId: str
    query: Dict[str, str]
    options: Dict[str, bool]
    webhook: str


class Address(TypedDict):
    street: str
    number: str
    neighborhood: str
    city: str
    uf: str
    cep: str
    full: str


class Rating(TypedDict):
    note: str
    quantity: int


class Contacts(TypedDict):
    phone: str
    whatsapp: str
    ddd: str
    email: str


class Social(TypedDict):
    instagram: str
    facebook: str
    site: str


class Extra(TypedDict):
    site_visitado: bool
    campos_encontrados: List[str]
    email: str
    instagram: str
    facebook: str


class Lead(TypedDict):
    name: str
    pic: str
    rating: Rating
    address: Address
    contacts: Contacts
    social: Social
    extra: Extra


class LeadPayload(TypedDict):
    """Payload recebido no seu webhook (um por lead)."""

    lead: Lead


class ScoreBreakdown(TypedDict):
    phone: int
    whatsapp: int
    website: int
    rating: int
    reviews: int
    address: int


class LeadRecord(TypedDict):
    """Lead persistido (retornado pelas rotas de histórico do painel)."""

    jobId: str
    name: str
    phone: str
    whatsapp: str
    ddd: str
    email: str
    instagram: str
    facebook: str
    website: str
    street: str
    number: str
    neighborhood: str
    city: str
    uf: str
    cep: str
    address: str
    rating: str
    reviews: str
    score: int
    tier: Tier
    breakdown: ScoreBreakdown
    siteVisitado: bool
    camposEncontrados: List[str]
    pic: str
    ms: Optional[int]
    at: int


class Counters(TypedDict):
    processed: int
    sent: int
    skippedNoPhone: int
    errors: int
    withPhone: int
    withoutPhone: int
    withWhatsapp: int
    withWebsite: int


class Latency(TypedDict):
    count: int
    totalMs: int
    min: Optional[int]
    max: Optional[int]
    lastMs: Optional[int]
    avgMs: int


class JobScore(TypedDict):
    sum: int
    count: int
    avg: int
    tiers: Dict[str, int]


class Job(TypedDict):
    id: str
    query: str
    requested: int
    onlyWithPhone: bool
    status: JobStatus
    createdAt: int
    phase1Ms: Optional[int]
    phase2StartedAt: Optional[int]
    finishedAt: Optional[int]
    error: Optional[str]
    totalFound: int
    counters: Counters
    latency: Latency
    score: JobScore
    leads: List[LeadRecord]


class SnapshotTotals(TypedDict):
    jobs: int
    leads: int
    sent: int
    withPhone: int
    withoutPhone: int
    withWhatsapp: int
    withWebsite: int
    skipped: int
    errors: int
    activeJobs: int
    pctWithPhone: int
    pctWithWhatsapp: int
    avgScore: int


class Snapshot(TypedDict):
    now: int
    uptimeMs: int
    totals: SnapshotTotals
    jobs: List[Job]
    recentLeads: List[LeadRecord]


class LeadsResponse(TypedDict):
    leads: List[LeadRecord]
    total: int
    limit: int
    offset: int


class JobsResponse(TypedDict):
    jobs: List[Job]


class JobLeadsResponse(TypedDict):
    leads: List[LeadRecord]
