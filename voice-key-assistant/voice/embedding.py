"""Utilidades de embeddings de hablante (resemblyzer) y persistencia de perfiles."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000


def l2_normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n == 0:
        raise ValueError("Embedding nulo")
    return v / n


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(l2_normalize(a), l2_normalize(b)))


@lru_cache(maxsize=1)
def _encoder():
    from resemblyzer import VoiceEncoder

    return VoiceEncoder()


def embed(audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Embedding 256-d normalizado de una frase (float32 mono)."""
    from resemblyzer import preprocess_wav

    wav = preprocess_wav(audio, source_sr=sample_rate)
    if len(wav) == 0:
        raise ValueError("Audio vacío tras eliminar silencios")
    return l2_normalize(_encoder().embed_utterance(wav))


def profile_path(profiles_dir: str | Path, name: str) -> Path:
    return Path(profiles_dir) / f"{name}.npy"


def anchor_path(profiles_dir: str | Path, name: str) -> Path:
    """Perfil original del enrolamiento; limita la deriva de la adaptación."""
    return Path(profiles_dir) / f"{name}.anchor.npy"


def save_profile(profiles_dir: str | Path, name: str, emb: np.ndarray, anchor: bool = False) -> Path:
    Path(profiles_dir).mkdir(parents=True, exist_ok=True)
    path = anchor_path(profiles_dir, name) if anchor else profile_path(profiles_dir, name)
    np.save(path, l2_normalize(emb).astype(np.float32))
    return path


def load_profile(profiles_dir: str | Path, name: str) -> np.ndarray:
    return np.load(profile_path(profiles_dir, name))
