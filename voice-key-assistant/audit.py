"""Registro de auditoría: una línea JSON por cada intento de interacción."""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# Resultados posibles de un intento
ACCEPTED = "accepted"              # hablante reconocido, se respondió
GUEST_ANSWERED = "guest_answered"  # voz no reconocida, respondida en modo invitado
IGNORED = "ignored"                # voz no reconocida y guest_mode=ignore
INVALID_AUDIO = "invalid_audio"    # no se pudo calcular el embedding
EMPTY_TRANSCRIPT = "empty_transcript"
ERROR = "error"


@dataclass
class Attempt:
    outcome: str
    speaker: Optional[str] = None
    role: Optional[str] = None
    score: Optional[float] = None
    threshold: Optional[float] = None
    accepted: bool = False
    adapted: bool = False
    audio_seconds: Optional[float] = None
    scores: dict[str, float] = field(default_factory=dict)
    transcript: Optional[str] = None
    response: Optional[str] = None
    error: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AuditLogger:
    def __init__(self, path: str | Path | None, log_transcripts: bool = True):
        self.path = Path(path) if path else None
        self.log_transcripts = log_transcripts
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, attempt: Attempt) -> None:
        if not self.log_transcripts:
            attempt.transcript = attempt.response = None
        score = f"{attempt.score:.3f}" if attempt.score is not None else "-"
        log.info("Intento: resultado=%s hablante=%s rol=%s score=%s umbral=%s adaptado=%s",
                 attempt.outcome, attempt.speaker or "desconocido", attempt.role or "-",
                 score, attempt.threshold, attempt.adapted)
        if self.path:
            data = asdict(attempt)
            data["scores"] = {k: round(v, 4) for k, v in data["scores"].items()}
            if data["score"] is not None:
                data["score"] = round(data["score"], 4)
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(data, ensure_ascii=False) + "\n")
