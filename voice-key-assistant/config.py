"""Carga de configuración desde config.yaml."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = PROJECT_ROOT / "config.yaml"


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    cfg_path = Path(path) if path else DEFAULT_CONFIG
    with open(cfg_path, encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh) or {}
    # profiles_dir relativo al proyecto
    voice = cfg.setdefault("voice", {})
    pdir = Path(voice.get("profiles_dir", "profiles"))
    if not pdir.is_absolute():
        pdir = PROJECT_ROOT / pdir
    voice["profiles_dir"] = str(pdir)
    return cfg
