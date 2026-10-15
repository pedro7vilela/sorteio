"""Registro persistente dos ganhadores do sorteio."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path

MAX_NAME_LENGTH = 120
_LOCK = threading.Lock()


def data_path() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "pyproject.toml").is_file():
            return parent / "data" / "ganhadores.json"
    return here.parent / "data" / "ganhadores.json"


def clear_winners() -> None:
    with _LOCK:
        path = data_path()
        for candidate in (path, path.with_suffix(".json.tmp")):
            try:
                candidate.unlink(missing_ok=True)
            except OSError:
                pass


def list_winners() -> list[dict[str, str]]:
    with _LOCK:
        return list(reversed(_read()))


def add_winner(nome: object) -> dict[str, str]:
    cleaned = _clean_name(nome)
    record = {
        "id": uuid.uuid4().hex,
        "nome": cleaned,
        "registrado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    with _LOCK:
        records = _read()
        records.append(record)
        _write(records)
    return record


def _clean_name(nome: object) -> str:
    if not isinstance(nome, str):
        raise ValueError("Informe o nome do ganhador.")
    cleaned = " ".join(nome.split())
    if not cleaned:
        raise ValueError("Informe o nome do ganhador.")
    if len(cleaned) > MAX_NAME_LENGTH:
        raise ValueError(f"O nome pode ter até {MAX_NAME_LENGTH} caracteres.")
    return cleaned


def _read() -> list[dict[str, str]]:
    path = data_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Não foi possível ler os ganhadores gravados.") from error
    if not isinstance(data, list):
        raise RuntimeError("Não foi possível ler os ganhadores gravados.")
    return [item for item in data if isinstance(item, dict)]


def _write(records: list[dict[str, str]]) -> None:
    path = data_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    try:
        temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
    except OSError as error:
        raise RuntimeError("Não foi possível gravar o ganhador.") from error
