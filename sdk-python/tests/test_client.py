"""Testes do cliente contra um servidor HTTP fake (stdlib).

Rodar:  PYTHONPATH=src python tests/test_client.py
"""

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from maps_to_lead import MapsToLead, MapsToLeadError

TOKEN = "secret-token"


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silencia o log do servidor
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else ""
        if token != TOKEN:
            self._json(401, {"error": True, "message": "Token inválido."})
            return False
        return True

    def do_POST(self):
        if urlparse(self.path).path == "/api/find":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._json(
                200,
                {
                    "error": False,
                    "message": "ok",
                    "jobId": "job_1",
                    "query": payload["query"],
                    "options": payload.get("options", {}),
                    "webhook": payload["webhook"]["url"],
                },
            )
            return
        self._json(404, {"error": True, "message": "não encontrado"})

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/manager/api/state":
            if not self._auth_ok():
                return
            self._json(
                200,
                {
                    "now": 1,
                    "uptimeMs": 1,
                    "totals": {"leads": 3, "sent": 2, "activeJobs": 0},
                    "jobs": [],
                    "recentLeads": [],
                },
            )
            return

        if path == "/manager/api/leads":
            if not self._auth_ok():
                return
            self._json(
                200,
                {"leads": [{"name": "ACME", "phone": "+55"}], "total": 1, "limit": 12, "offset": 0},
            )
            return

        if path == "/manager/api/leads.xlsx":
            if not self._auth_ok():
                return
            data = b"PK\x03\x04"  # assinatura zip/xlsx
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/manager/stream":
            if not self._auth_ok():
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                self.wfile.write(b'data: {"totals":{"activeJobs":1,"leads":1}}\n\n')
                self.wfile.flush()
                time.sleep(0.02)
                self.wfile.write(b'data: {"totals":{"activeJobs":0,"leads":3}}\n\n')
                self.wfile.flush()
                for _ in range(300):  # keep-alive até o cliente desconectar
                    time.sleep(0.02)
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return

        self._json(404, {"error": True, "message": "não encontrado"})


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.base_url = "http://127.0.0.1:%d" % port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def client(self, token=TOKEN):
        return MapsToLead(self.base_url, token=token)

    def test_find_sem_token(self):
        res = MapsToLead(self.base_url).find(
            query={"type": "software"}, webhook={"url": "https://webhook.site/x"}
        )
        self.assertEqual(res["jobId"], "job_1")
        self.assertEqual(res["webhook"], "https://webhook.site/x")

    def test_find_valida_type(self):
        with self.assertRaises(MapsToLeadError):
            MapsToLead(self.base_url).find(query={"type": ""}, webhook={"url": "x"})

    def test_find_valida_webhook(self):
        with self.assertRaises(MapsToLeadError):
            MapsToLead(self.base_url).find(query={"type": "x"}, webhook={"url": ""})

    def test_get_state_com_token(self):
        state = self.client().get_state()
        self.assertEqual(state["totals"]["leads"], 3)

    def test_get_state_sem_token(self):
        with self.assertRaises(MapsToLeadError) as ctx:
            MapsToLead(self.base_url).get_state()
        self.assertEqual(ctx.exception.status, 0)  # nem chega a requisitar

    def test_token_errado_401(self):
        with self.assertRaises(MapsToLeadError) as ctx:
            self.client(token="wrong").get_state()
        self.assertEqual(ctx.exception.status, 401)
        self.assertTrue(ctx.exception.is_unauthorized)

    def test_get_leads(self):
        page = self.client().get_leads(limit=12, offset=0)
        self.assertEqual(page["total"], 1)
        self.assertEqual(page["leads"][0]["name"], "ACME")

    def test_export_xlsx(self):
        data = self.client().export_leads_xlsx()
        self.assertIsInstance(data, bytes)
        self.assertTrue(data.startswith(b"PK"))

    def test_stream_snapshots(self):
        snaps = []
        for snap in self.client().stream_snapshots():
            snaps.append(snap)
            if snap["totals"]["activeJobs"] == 0:
                break
        self.assertEqual(len(snaps), 2)
        self.assertEqual(snaps[0]["totals"]["activeJobs"], 1)
        self.assertEqual(snaps[1]["totals"]["leads"], 3)

    def test_on_snapshot(self):
        seen = []
        done = threading.Event()
        holder = {}

        def handler(snap):
            seen.append(snap)
            if snap["totals"]["activeJobs"] == 0:
                holder["stop"]()
                done.set()

        holder["stop"] = self.client().on_snapshot(handler, on_error=lambda e: None)
        self.assertTrue(done.wait(5), "não recebeu snapshots a tempo")
        self.assertEqual(len(seen), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
