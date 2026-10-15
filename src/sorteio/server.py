"""Servidor local da roda de sorteio."""

from __future__ import annotations

import argparse
import json
import signal
import socket
import uuid
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from sorteio.ganhadores import add_winner, clear_winners, list_winners

STATIC_DIR = Path(__file__).resolve().parent / "static"
HOST = "127.0.0.1"
WINNERS_PATH = "/api/ganhadores"
SESSION_PATH = "/api/sessao"
SESSION_ID = ""


class QuietHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(f"[sorteio] {self.address_string()} - {format % args}")

    def do_GET(self) -> None:
        route = self._route()
        if route == WINNERS_PATH:
            self._handle_list()
            return
        if route == SESSION_PATH:
            self._send_json(200, {"id": SESSION_ID})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self._route() != WINNERS_PATH:
            self._send_json(404, {"erro": "Não encontrado."})
            return
        self._handle_create()

    def do_DELETE(self) -> None:
        if self._route() != WINNERS_PATH:
            self._send_json(404, {"erro": "Não encontrado."})
            return
        clear_winners()
        self._send_json(200, {"ganhadores": []})

    def _route(self) -> str:
        return urlsplit(self.path).path

    def _handle_list(self) -> None:
        try:
            winners = list_winners()
        except RuntimeError as error:
            self._send_json(500, {"erro": str(error)})
            return
        self._send_json(200, {"ganhadores": winners})

    def _handle_create(self) -> None:
        try:
            payload = self._read_json()
            winner = add_winner(payload.get("nome"))
        except ValueError as error:
            self._send_json(400, {"erro": str(error)})
            return
        except (RuntimeError, json.JSONDecodeError):
            self._send_json(500, {"erro": "Não foi possível gravar o ganhador."})
            return
        self._send_json(201, {"ganhador": winner})

    def _read_json(self) -> dict[str, object]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Corpo inválido.") from error
        if length <= 0 or length > 8192:
            raise ValueError("Corpo inválido.")
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Corpo inválido.") from error
        if not isinstance(payload, dict):
            raise ValueError("Corpo inválido.")
        return payload

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def find_port(start: int) -> int:
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
            except OSError:
                continue
            return port
    raise SystemExit(f"Nenhuma porta livre entre {start} e {start + 19}.")


def _stop(_signum: int, _frame: object) -> None:
    raise KeyboardInterrupt


def main() -> None:
    global SESSION_ID
    SESSION_ID = uuid.uuid4().hex
    clear_winners()

    parser = argparse.ArgumentParser(description="Abre a roda de sorteio no navegador.")
    parser.add_argument("--port", type=int, default=8000, help="Porta inicial (padrão: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Não abre o navegador")
    args = parser.parse_args()

    if not STATIC_DIR.is_dir():
        raise SystemExit(f"Arquivos da interface não encontrados em {STATIC_DIR}.")

    port = find_port(args.port)
    handler = partial(QuietHandler, directory=str(STATIC_DIR))
    server = ThreadingHTTPServer((HOST, port), handler)
    url = f"http://{HOST}:{port}"

    print(f"Sorteio disponível em {url}", flush=True)
    print("Pressione Ctrl+C para encerrar.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando.", flush=True)
    finally:
        clear_winners()
        server.server_close()
        print("Nomes salvos removidos.", flush=True)
