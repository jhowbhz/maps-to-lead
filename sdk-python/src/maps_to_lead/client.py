"""Cliente HTTP da API Maps to Lead.

Sem dependências de terceiros — usa apenas a biblioteca padrão (``urllib``).
Instancie uma vez e reutilize:

    from maps_to_lead import MapsToLead

    client = MapsToLead("http://localhost:9000", token="MANAGER_TOKEN")
    job = client.find(
        query={"type": "software", "city": "centro", "state": "rio de janeiro"},
        webhook={"url": "https://webhook.site/seu-id"},
        options={"only_with_phone": True},
    )
    print(job["jobId"])
"""

from __future__ import annotations

import json
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Iterator, Mapping, Optional, Union

from ._sse import iter_sse
from .errors import MapsToLeadError
from .models import (
    FindOptions,
    FindQuery,
    FindResponse,
    FindWebhook,
    JobLeadsResponse,
    JobsResponse,
    LeadsResponse,
    Snapshot,
)

__all__ = ["MapsToLead"]

# Sentinela para "use o timeout padrão do cliente" (permite `timeout=None` =
# sem timeout, distinto de "não informado").
_UNSET = object()

QueryLike = Union[FindQuery, Mapping[str, Any]]
WebhookLike = Union[FindWebhook, Mapping[str, Any]]
OptionsLike = Union[FindOptions, Mapping[str, Any], None]


class MapsToLead:
    """Cliente da API Maps to Lead.

    :param base_url: URL base do servidor (ex.: ``https://seu-host:9000``).
    :param token: ``MANAGER_TOKEN`` — exigido pelos endpoints do painel.
    :param timeout: timeout padrão por requisição, em segundos (``None`` desliga).
    :param headers: headers extras enviados em toda requisição.
    :param opener: ``urllib.request.OpenerDirector`` customizado (ex.: proxy).
    """

    def __init__(
        self,
        base_url: str,
        *,
        token: Optional[str] = None,
        timeout: Optional[float] = 30.0,
        headers: Optional[Mapping[str, str]] = None,
        opener: Optional[urllib.request.OpenerDirector] = None,
    ) -> None:
        if not base_url or not str(base_url).strip():
            raise MapsToLeadError("`base_url` é obrigatório ao criar o cliente MapsToLead.")
        self._base_url = str(base_url).strip().rstrip("/")
        self._token = token.strip() if isinstance(token, str) and token.strip() else None
        self._timeout = timeout
        self._headers = dict(headers or {})
        self._opener = opener or urllib.request.build_opener()

    # --- Busca --------------------------------------------------------------

    def find(
        self,
        query: QueryLike,
        webhook: WebhookLike,
        options: OptionsLike = None,
        *,
        timeout: Any = _UNSET,
    ) -> FindResponse:
        """Inicia uma busca (``POST /api/find``).

        Responde na hora com o ``jobId`` — a extração roda em segundo plano e os
        leads chegam no ``webhook["url"]``. Não exige token.
        """
        q = _as_query(query)
        w = _as_webhook(webhook)
        if not q.type or not q.type.strip():
            raise MapsToLeadError("`query.type` é obrigatório em find().")
        if not w.url or not w.url.strip():
            raise MapsToLeadError("`webhook.url` é obrigatório em find().")
        payload = _build_find_payload(q, w, _as_options(options))
        return self._request_json("POST", "/api/find", json_body=payload, timeout=timeout)

    # --- Painel / histórico (exigem token) ----------------------------------

    def get_state(self, *, timeout: Any = _UNSET) -> Snapshot:
        """Snapshot ao vivo do painel (``GET /manager/api/state``)."""
        return self._request_json("GET", "/manager/api/state", auth=True, timeout=timeout)

    def get_jobs(self, *, limit: Optional[int] = None, timeout: Any = _UNSET) -> JobsResponse:
        """Histórico de jobs persistidos (``GET /manager/api/jobs``)."""
        return self._request_json(
            "GET", "/manager/api/jobs", params={"limit": limit}, auth=True, timeout=timeout
        )

    def get_leads(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        timeout: Any = _UNSET,
    ) -> LeadsResponse:
        """Todos os leads persistidos, paginado (``GET /manager/api/leads``)."""
        return self._request_json(
            "GET",
            "/manager/api/leads",
            params={"limit": limit, "offset": offset},
            auth=True,
            timeout=timeout,
        )

    def get_job_leads(
        self,
        job_id: str,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        timeout: Any = _UNSET,
    ) -> JobLeadsResponse:
        """Leads de um job, paginado (``GET /manager/api/jobs/:id/leads``)."""
        if not job_id or not str(job_id).strip():
            raise MapsToLeadError("`job_id` é obrigatório em get_job_leads().")
        path = "/manager/api/jobs/%s/leads" % urllib.parse.quote(str(job_id), safe="")
        return self._request_json(
            "GET", path, params={"limit": limit, "offset": offset}, auth=True, timeout=timeout
        )

    def export_leads_xlsx(self, *, timeout: Any = _UNSET) -> bytes:
        """Exporta todos os leads persistidos como planilha ``.xlsx``.

        Retorna os bytes do arquivo (``GET /manager/api/leads.xlsx``).
        """
        resp = self._open(
            "GET",
            "/manager/api/leads.xlsx",
            auth=True,
            timeout=timeout,
            accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        try:
            return resp.read()
        finally:
            resp.close()

    # --- Stream ao vivo (SSE) -----------------------------------------------

    def stream_snapshots(self, *, timeout: Optional[float] = None) -> Iterator[Snapshot]:
        """Assina o stream ao vivo do painel (``GET /manager/stream``).

        Gera snapshots conforme chegam. Encerre saindo do ``for`` (``break``).
        Por ser de longa duração, o padrão é **sem timeout**.

            for snap in client.stream_snapshots():
                print(snap["totals"]["leads"])
                if snap["totals"]["activeJobs"] == 0:
                    break
        """
        resp = self._open(
            "GET", "/manager/stream", auth=True, timeout=timeout, accept="text/event-stream"
        )
        try:
            for data in iter_sse(resp):
                yield json.loads(data)
        finally:
            resp.close()

    def on_snapshot(
        self,
        handler: Callable[[Snapshot], None],
        *,
        on_error: Optional[Callable[[BaseException], None]] = None,
    ) -> Callable[[], None]:
        """Assina o stream numa thread de fundo e chama ``handler`` a cada snapshot.

        Retorna uma função ``stop()`` que encerra a assinatura.
        """
        stop_flag = threading.Event()
        state: Dict[str, Any] = {"resp": None}

        def run() -> None:
            try:
                resp = self._open(
                    "GET",
                    "/manager/stream",
                    auth=True,
                    timeout=None,
                    accept="text/event-stream",
                )
                state["resp"] = resp
                for data in iter_sse(resp):
                    if stop_flag.is_set():
                        break
                    handler(json.loads(data))
            except BaseException as exc:  # noqa: BLE001 - repassado ao on_error
                if not stop_flag.is_set() and on_error is not None:
                    on_error(exc)
            finally:
                resp = state.get("resp")
                if resp is not None:
                    try:
                        resp.close()
                    except Exception:
                        pass

        thread = threading.Thread(target=run, name="maps-to-lead-sse", daemon=True)
        thread.start()

        def stop() -> None:
            stop_flag.set()
            resp = state.get("resp")
            if resp is not None:
                try:
                    resp.close()  # desbloqueia a leitura na thread de fundo
                except Exception:
                    pass

        return stop

    # --- Internos -----------------------------------------------------------

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json_body: Any = None,
        auth: bool = False,
        timeout: Any = _UNSET,
    ) -> Any:
        resp = self._open(
            method, path, params=params, json_body=json_body, auth=auth, timeout=timeout
        )
        status = getattr(resp, "status", 200)
        try:
            raw = resp.read()
        finally:
            resp.close()
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError as exc:
            raise MapsToLeadError(
                "Resposta da API não é JSON válido.",
                status=status,
                url=self._build_url(path, params),
                body=raw.decode("utf-8", "replace"),
            ) from exc

    def _open(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json_body: Any = None,
        auth: bool = False,
        timeout: Any = _UNSET,
        accept: str = "application/json",
    ):
        url = self._build_url(path, params)
        headers = dict(self._headers)
        headers.setdefault("Accept", accept)

        data = None
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth:
            headers["Authorization"] = "Bearer %s" % self._require_token()

        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        effective = self._timeout if timeout is _UNSET else timeout
        open_kwargs: Dict[str, Any] = {}
        if effective is not None:
            open_kwargs["timeout"] = effective

        try:
            return self._opener.open(request, **open_kwargs)
        except urllib.error.HTTPError as exc:
            raise self._error_from_http(exc, url) from exc
        except (socket.timeout, TimeoutError) as exc:
            raise MapsToLeadError("Requisição expirada (timeout).", status=0, url=url) from exc
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            is_timeout = isinstance(reason, (socket.timeout, TimeoutError))
            message = (
                "Requisição expirada (timeout)."
                if is_timeout
                else "Falha de rede ao contatar a API Maps to Lead."
            )
            raise MapsToLeadError(message, status=0, url=url) from exc

    def _error_from_http(self, exc: urllib.error.HTTPError, url: str) -> MapsToLeadError:
        text = ""
        try:
            body_bytes = exc.read()
            text = body_bytes.decode("utf-8", "replace") if body_bytes else ""
        except Exception:  # pragma: no cover - corpo pode não ser legível
            text = ""

        body: Any = None
        if text:
            try:
                body = json.loads(text)
            except ValueError:
                body = text

        message: Optional[str] = None
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            message = body["message"]
        if not message:
            message = "Requisição falhou com HTTP %s." % exc.code
        return MapsToLeadError(message, status=exc.code, url=url, body=body)

    def _build_url(self, path: str, params: Optional[Mapping[str, Any]] = None) -> str:
        url = self._base_url + path
        if params:
            filtered = {k: v for k, v in params.items() if v is not None}
            if filtered:
                sep = "&" if "?" in url else "?"
                url += sep + urllib.parse.urlencode(filtered)
        return url

    def _require_token(self) -> str:
        if not self._token:
            raise MapsToLeadError(
                "Este endpoint requer o MANAGER_TOKEN. "
                "Passe `token=...` ao criar o cliente MapsToLead."
            )
        return self._token


# --- Coerção de entrada -----------------------------------------------------


def _as_query(value: QueryLike) -> FindQuery:
    if isinstance(value, FindQuery):
        return value
    if isinstance(value, Mapping):
        return FindQuery(
            type=str(value.get("type", "")),
            city=str(value.get("city", "")),
            state=str(value.get("state", "")),
        )
    raise MapsToLeadError("`query` deve ser um FindQuery ou dict.")


def _as_webhook(value: WebhookLike) -> FindWebhook:
    if isinstance(value, FindWebhook):
        return value
    if isinstance(value, Mapping):
        return FindWebhook(
            url=str(value.get("url", "")),
            retry=bool(value.get("retry", True)),
            timeout=value.get("timeout"),
        )
    raise MapsToLeadError("`webhook` deve ser um FindWebhook ou dict.")


def _as_options(value: OptionsLike) -> FindOptions:
    if value is None:
        return FindOptions()
    if isinstance(value, FindOptions):
        return value
    if isinstance(value, Mapping):
        def pick(*keys: str, default: bool) -> bool:
            for key in keys:
                if key in value:
                    return bool(value[key])
            return default

        return FindOptions(
            only_with_phone=pick("only_with_phone", "onlyWithPhone", default=False),
            only_repeat=pick("only_repeat", "onlyRepeat", default=True),
            only_infos_extras=pick("only_infos_extras", "onlyInfosExtras", default=False),
        )
    raise MapsToLeadError("`options` deve ser um FindOptions, dict ou None.")


def _build_find_payload(
    query: FindQuery, webhook: FindWebhook, options: FindOptions
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "query": {"type": query.type, "city": query.city, "state": query.state},
        "webhook": {"url": webhook.url, "retry": webhook.retry},
        "options": {
            "onlyWithPhone": options.only_with_phone,
            "onlyRepeat": options.only_repeat,
            "onlyInfosExtras": options.only_infos_extras,
        },
    }
    if webhook.timeout is not None:
        payload["webhook"]["timeout"] = webhook.timeout
    return payload
