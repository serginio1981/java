"""Verificación/identificación de hablante con adaptación continua del perfil."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from voice.embedding import (
    anchor_path,
    cosine_similarity,
    l2_normalize,
    profile_path,
    save_profile,
)

log = logging.getLogger(__name__)


@dataclass
class AdaptationConfig:
    enabled: bool = True
    alpha: float = 0.05
    min_score: float = 0.82
    max_drift: float = 0.85

    @classmethod
    def from_dict(cls, d: dict) -> "AdaptationConfig":
        return cls(**{k: v for k, v in (d or {}).items() if k in cls.__annotations__})


@dataclass
class VerificationResult:
    name: Optional[str]        # perfil reconocido o None
    score: float               # mejor similitud coseno
    accepted: bool
    adapted: bool = False
    scores: dict[str, float] = field(default_factory=dict)


def adapt_profile(profile: np.ndarray, emb: np.ndarray, alpha: float) -> np.ndarray:
    """Media móvil exponencial sobre embeddings normalizados."""
    return l2_normalize((1.0 - alpha) * l2_normalize(profile) + alpha * l2_normalize(emb))


class SpeakerVerifier:
    """Compara un embedding contra todos los perfiles cargados.

    Seguridad de la adaptación: solo se actualiza con puntajes >= min_score
    (más estricto que el umbral de aceptación) y nunca si el perfil resultante
    se aleja del perfil de enrolamiento (anchor) más allá de max_drift. Esto
    evita que el perfil "derive" lentamente hacia otra voz.
    """

    def __init__(self, profiles_dir: str | Path, threshold: float = 0.75,
                 adaptation: AdaptationConfig | None = None, persist: bool = True):
        self.profiles_dir = Path(profiles_dir)
        self.threshold = threshold
        self.adaptation = adaptation or AdaptationConfig()
        self.persist = persist
        self.profiles: dict[str, np.ndarray] = {}
        self.anchors: dict[str, np.ndarray] = {}
        self.reload()

    def reload(self) -> None:
        self.profiles.clear()
        self.anchors.clear()
        if not self.profiles_dir.exists():
            return
        for p in sorted(self.profiles_dir.glob("*.npy")):
            if p.name.endswith(".anchor.npy"):
                continue
            name = p.stem
            self.profiles[name] = np.load(p)
            a = anchor_path(self.profiles_dir, name)
            self.anchors[name] = np.load(a) if a.exists() else self.profiles[name].copy()

    def add_profile(self, name: str, emb: np.ndarray) -> None:
        """Registra un perfil en memoria (útil en tests)."""
        self.profiles[name] = l2_normalize(emb)
        self.anchors[name] = l2_normalize(emb)

    def verify(self, emb: np.ndarray) -> VerificationResult:
        if not self.profiles:
            return VerificationResult(None, 0.0, False)
        scores = {n: cosine_similarity(emb, p) for n, p in self.profiles.items()}
        best = max(scores, key=scores.get)
        score = scores[best]
        if score < self.threshold:
            return VerificationResult(None, score, False, scores=scores)
        adapted = self._maybe_adapt(best, emb, score)
        return VerificationResult(best, score, True, adapted, scores)

    def _maybe_adapt(self, name: str, emb: np.ndarray, score: float) -> bool:
        cfg = self.adaptation
        if not cfg.enabled or score < cfg.min_score:
            return False
        candidate = adapt_profile(self.profiles[name], emb, cfg.alpha)
        drift = cosine_similarity(candidate, self.anchors[name])
        if drift < cfg.max_drift:
            log.warning("Adaptación rechazada para '%s': deriva %.3f < %.3f", name, drift, cfg.max_drift)
            return False
        self.profiles[name] = candidate
        if self.persist:
            save_profile(self.profiles_dir, name, candidate)
        return True
