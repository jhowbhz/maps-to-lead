"""SDK cliente (Python) para a API Maps to Lead.

Prospecção de leads a partir do Google Maps. De maneira nenhuma apoiamos ou
incentivamos a prática de SPAM — utilize com sabedoria.
"""

from __future__ import annotations

from .client import MapsToLead
from .errors import MapsToLeadError
from .models import FindOptions, FindQuery, FindWebhook

__all__ = [
    "MapsToLead",
    "MapsToLeadError",
    "FindQuery",
    "FindWebhook",
    "FindOptions",
]

__version__ = "0.0.1"
