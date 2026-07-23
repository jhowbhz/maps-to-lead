"""Exemplo básico: inicia uma busca e acompanha o progresso ao vivo.

    MANAGER_TOKEN=seu-token python examples/basic.py
"""

import os

from maps_to_lead import MapsToLead, MapsToLeadError


def main() -> None:
    client = MapsToLead(
        os.environ.get("BASE_URL", "http://localhost:9000"),
        token=os.environ.get("MANAGER_TOKEN"),
    )

    try:
        job = client.find(
            query={"type": "software", "city": "centro", "state": "rio de janeiro"},
            webhook={"url": os.environ.get("WEBHOOK_URL", "https://webhook.site/replace-me")},
            options={"only_with_phone": True, "only_repeat": False},
        )
        print("Busca iniciada:", job["jobId"])

        # Acompanha o painel ao vivo até o job terminar.
        for snap in client.stream_snapshots():
            totals = snap["totals"]
            print(
                "leads=%s enviados=%s jobs_ativos=%s"
                % (totals["leads"], totals["sent"], totals["activeJobs"])
            )
            if totals["activeJobs"] == 0:
                break
        print("Concluído.")
    except MapsToLeadError as e:
        print("Erro HTTP %s: %s" % (e.status, e))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
